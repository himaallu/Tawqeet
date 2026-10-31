import { and, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import { alertRules, alertsSent, clients, companies, drafts, leads, leadSignals, signals } from "../db/schema";
import { HOT_ALERTS_PER_DAY, shouldRealert, smsSendTime } from "../lib/cadence";
import { decryptJson } from "../lib/crypto";
import { isFirstWorkdayOfWeek, isWorkday, offsetMinutes, startOfLocalDay } from "../lib/gulf-time";
import { http } from "../lib/http";
import { enqueue, Q } from "../lib/jobs";
import { escapeHtml, layoutHtml, sendMail } from "../lib/mail";

/**
 * Hot-lead alerts and the warm/cold digests. Channels: email (Resend), SMS (Twilio), webhook,
 * and project-management tasks (Asana, ClickUp, Trello). See lib/cadence.ts for the rules.
 */

type Rule = typeof alertRules.$inferSelect;
export type AlertPayload = {
  lead: { id: string; name: string | null; title: string | null; email: string | null; temperature: string };
  company: { name: string; domain: string | null; country: string | null };
  signals: { title: string; url: string | null; detected_at: string }[];
  temp_score: number;
  why_now: string | null;
  dashboard_url: string;
};

const appUrl = () => (process.env.APP_URL ?? "http://localhost:5000").replace(/\/$/, "");

export async function buildPayload(agencyId: string, leadId: string): Promise<AlertPayload | null> {
  const [row] = await db
    .select({ lead: leads, company: companies })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(leads.agencyId, agencyId), eq(leads.id, leadId)));
  if (!row) return null;
  const sigs = await db
    .select({ title: signals.title, url: signals.url, detectedAt: signals.detectedAt })
    .from(leadSignals)
    .innerJoin(signals, eq(signals.id, leadSignals.signalId))
    .where(eq(leadSignals.leadId, leadId))
    .orderBy(desc(signals.detectedAt))
    .limit(5);
  return {
    lead: { id: row.lead.id, name: row.lead.fullName, title: row.lead.title, email: row.lead.email, temperature: row.lead.temperature },
    company: { name: row.company.name, domain: row.company.domain, country: row.company.country },
    signals: sigs.map((s) => ({ title: s.title, url: s.url?.startsWith("http") ? s.url : null, detected_at: s.detectedAt.toISOString() })),
    temp_score: row.lead.tempScore,
    why_now: row.lead.whyNow,
    dashboard_url: `${appUrl()}/app/review?client=${row.lead.clientId}&lead=${row.lead.id}`,
  };
}

const taskTitle = (p: AlertPayload) => `🔥 ${p.company.name} — ${p.why_now ?? "new signal"}`.slice(0, 250);
const taskBody = (p: AlertPayload) =>
  [
    `${p.lead.name ?? "Contact"} · ${p.lead.title ?? ""} · ${p.lead.email ?? ""}`,
    `Thermometer: ${p.temp_score}/100 (${p.lead.temperature})`,
    "",
    "Signals:",
    ...p.signals.map((s) => `• ${s.title}${s.url ? ` (${s.url})` : ""}`),
    "",
    `Review & send: ${p.dashboard_url}`,
  ].join("\n");

async function expectOk(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what} ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) throw new Error("Twilio is not configured (TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM)");
  const res = await http(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 600) }),
  });
  await expectOk(res, "Twilio");
}

function ruleSecret(rule: Rule): string {
  if (!rule.secretEncrypted) throw new Error(`${rule.channel} rule has no API token`);
  return decryptJson<{ token: string }>(rule.secretEncrypted).token;
}

/** Delivers one message on one rule's channel. */
export async function deliver(rule: Rule, title: string, body: string, payload: unknown) {
  switch (rule.channel) {
    case "email":
      return sendMail({
        to: rule.target,
        subject: title,
        text: body,
        html: layoutHtml(title, `<pre style="white-space:pre-wrap;font:inherit">${escapeHtml(body)}</pre>`),
      });
    case "sms":
      return sendSms(rule.target, `${title}\n${body}`);
    case "webhook":
      return expectOk(
        await http(rule.target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
        "Webhook",
      );
    case "asana":
      return expectOk(
        await http("https://app.asana.com/api/1.0/tasks", {
          method: "POST",
          headers: { authorization: `Bearer ${ruleSecret(rule)}`, "content-type": "application/json" },
          body: JSON.stringify({ data: { name: title, notes: body, projects: [rule.target] } }),
        }),
        "Asana",
      );
    case "clickup":
      return expectOk(
        await http(`https://api.clickup.com/api/v2/list/${encodeURIComponent(rule.target)}/task`, {
          method: "POST",
          headers: { authorization: ruleSecret(rule), "content-type": "application/json" },
          body: JSON.stringify({ name: title, description: body }),
        }),
        "ClickUp",
      );
    case "trello": {
      const [key, token] = ruleSecret(rule).split(":");
      const qs = new URLSearchParams({ idList: rule.target, key, token, name: title, desc: body });
      return expectOk(await http(`https://api.trello.com/1/cards?${qs}`, { method: "POST" }), "Trello");
    }
  }
}

const qualifies = (rule: Rule, temperature: string) => temperature === "hot" || (rule.minTemperature === "warm" && temperature === "warm");

/**
 * Instant alert for a lead whose drafts are ready. Only Hot leads alert instantly; Warm leads
 * wait for the 08:30 digest; Cold leads never alert.
 */
export async function alertLead(agencyId: string, leadId: string, now = new Date()) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.agencyId, agencyId), eq(leads.id, leadId)));
  if (!lead || lead.status !== "ready" || lead.temperature !== "hot") return { status: "skipped" as const };
  if (!shouldRealert({ at: lead.lastAlertedAt, score: lead.lastAlertScore }, lead.tempScore, now)) return { status: "repeat" as const };

  const [client] = await db.select().from(clients).where(eq(clients.id, lead.clientId));
  const rules = (await db.select().from(alertRules).where(and(eq(alertRules.clientId, lead.clientId), eq(alertRules.active, true)))).filter(
    (r) => qualifies(r, "hot"),
  );
  if (!rules.length) return { status: "no_rules" as const };
  const payload = (await buildPayload(agencyId, leadId))!;

  // Max 5 individual hot alerts per client per local day; the rest are bundled.
  const dayStart = startOfLocalDay(now, client.timezone);
  const todays = await db
    .selectDistinct({ leadId: alertsSent.leadId })
    .from(alertsSent)
    .where(and(eq(alertsSent.clientId, lead.clientId), eq(alertsSent.status, "sent"), gte(alertsSent.createdAt, dayStart), ne(alertsSent.channel, "digest-warm")));
  const bundled = todays.length >= HOT_ALERTS_PER_DAY;

  await db.update(leads).set({ lastAlertedAt: now, lastAlertScore: lead.tempScore }).where(eq(leads.id, lead.id));

  if (bundled) {
    await db.insert(alertsSent).values({ agencyId, clientId: lead.clientId, leadId, channel: "bundle", tempScore: lead.tempScore, status: "bundled" });
    await enqueue(
      Q.alert,
      { agencyId, bundleClientId: lead.clientId },
      { startAfter: new Date(now.getTime() + 60 * 60_000), singletonKey: `bundle:${lead.clientId}:${dayStart.toISOString()}` },
    );
    return { status: "bundled" as const };
  }

  for (const rule of rules) {
    if (rule.channel === "sms") {
      const at = smsSendTime(now, client.timezone);
      if (at > now) {
        await db.insert(alertsSent).values({ agencyId, clientId: lead.clientId, leadId, ruleId: rule.id, channel: "sms", tempScore: lead.tempScore, status: "held", detail: `until ${at.toISOString()}` });
        await enqueue(Q.alert, { agencyId, heldRuleId: rule.id, leadId }, { startAfter: at });
        continue;
      }
    }
    await deliverAndLog(agencyId, rule, leadId, payload);
  }
  return { status: "sent" as const };
}

async function deliverAndLog(agencyId: string, rule: Rule, leadId: string, payload: AlertPayload) {
  try {
    await deliver(rule, taskTitle(payload), taskBody(payload), payload);
    await db.insert(alertsSent).values({ agencyId, clientId: rule.clientId, leadId, ruleId: rule.id, channel: rule.channel, tempScore: payload.temp_score, status: "sent" });
  } catch (e) {
    await db.insert(alertsSent).values({ agencyId, clientId: rule.clientId, leadId, ruleId: rule.id, channel: rule.channel, tempScore: payload.temp_score, status: "failed", detail: (e as Error).message.slice(0, 500) });
  }
}

/** A held SMS whose 08:00 has come. */
export async function releaseHeld(agencyId: string, ruleId: string, leadId: string) {
  const [rule] = await db.select().from(alertRules).where(and(eq(alertRules.agencyId, agencyId), eq(alertRules.id, ruleId)));
  const payload = await buildPayload(agencyId, leadId);
  if (rule?.active && payload) await deliverAndLog(agencyId, rule, leadId, payload);
}

/** One message for every hot lead bundled today beyond the cap. */
export async function flushBundle(agencyId: string, clientId: string) {
  const pending = await db
    .select()
    .from(alertsSent)
    .where(and(eq(alertsSent.agencyId, agencyId), eq(alertsSent.clientId, clientId), eq(alertsSent.status, "bundled"), isNull(alertsSent.detail)));
  if (!pending.length) return { delivered: 0 };
  const payloads = (await Promise.all(pending.map((p) => buildPayload(agencyId, p.leadId!)))).filter(Boolean) as AlertPayload[];
  const title = `🔥 ${payloads.length} more hot leads ready`;
  const body = payloads.map((p) => `• ${p.company.name} (${p.temp_score}) — ${p.why_now ?? ""}\n  ${p.dashboard_url}`).join("\n");
  const rules = (await db.select().from(alertRules).where(and(eq(alertRules.clientId, clientId), eq(alertRules.active, true)))).filter((r) => qualifies(r, "hot"));
  for (const rule of rules) {
    try {
      await deliver(rule, title, body, { bundle: payloads });
    } catch (e) {
      console.warn(`[alerts] bundle ${rule.channel}: ${(e as Error).message}`);
    }
  }
  await db.update(alertsSent).set({ detail: "delivered" }).where(inArray(alertsSent.id, pending.map((p) => p.id)));
  return { delivered: payloads.length };
}

// ---------- digests ----------

async function emailRules(clientId: string, min: "warm" | "hot") {
  return (await db.select().from(alertRules).where(and(eq(alertRules.clientId, clientId), eq(alertRules.active, true), eq(alertRules.channel, "email")))).filter(
    (r) => min === "hot" || r.minTemperature === "warm",
  );
}

/** Runs at 08:30 for clients in the given zone's offset; skips non-workdays. */
export async function warmDigest(timezone: string, now = new Date()) {
  const all = await db.select().from(clients);
  const inZone = all.filter((c) => offsetMinutes(c.timezone, now) === offsetMinutes(timezone, now) && isWorkday(now, c.timezone));
  let sent = 0;
  for (const client of inZone) {
    const since = new Date(now.getTime() - 26 * 3_600_000);
    const already = await db
      .select({ leadId: alertsSent.leadId })
      .from(alertsSent)
      .where(and(eq(alertsSent.clientId, client.id), eq(alertsSent.channel, "digest-warm"), gte(alertsSent.createdAt, since)));
    const exclude = new Set(already.map((a) => a.leadId));
    const ready = (
      await db
        .select({ lead: leads, company: companies })
        .from(leads)
        .innerJoin(companies, eq(companies.id, leads.companyId))
        .where(and(eq(leads.clientId, client.id), eq(leads.status, "ready"), eq(leads.temperature, "warm")))
        .orderBy(desc(leads.tempScore))
    ).filter((r) => !exclude.has(r.lead.id));
    const rules = await emailRules(client.id, "warm");
    if (!ready.length || !rules.length) continue;

    const list = ready.slice(0, 25);
    const title = `${client.name}: ${ready.length} warm lead${ready.length > 1 ? "s" : ""} ready to review`;
    const body = list
      .map((r) => `• ${r.company.name} · ${r.lead.fullName ?? ""}, ${r.lead.title ?? ""} — ${r.lead.tempScore}/100\n  ${r.lead.whyNow ?? ""}`)
      .join("\n") + `\n\nOpen the Ready queue: ${appUrl()}/app/review?client=${client.id}`;
    for (const rule of rules) {
      try {
        await deliver(rule, title, body, {});
      } catch (e) {
        console.warn(`[digest] ${(e as Error).message}`);
      }
    }
    await db.insert(alertsSent).values(list.map((r) => ({ agencyId: client.agencyId, clientId: client.id, leadId: r.lead.id, channel: "digest-warm", tempScore: r.lead.tempScore, status: "sent" })));
    sent++;
  }
  return { clients: sent };
}

/** Weekly cold-watchlist summary on the client's first workday. */
export async function coldSummary(timezone: string, now = new Date()) {
  const all = await db.select().from(clients);
  const inZone = all.filter((c) => offsetMinutes(c.timezone, now) === offsetMinutes(timezone, now) && isFirstWorkdayOfWeek(now, c.timezone));
  let sent = 0;
  for (const client of inZone) {
    const cold = await db
      .select({ lead: leads, company: companies })
      .from(leads)
      .innerJoin(companies, eq(companies.id, leads.companyId))
      .where(and(eq(leads.clientId, client.id), eq(leads.temperature, "cold"), inArray(leads.status, ["new", "drafted", "ready"])))
      .orderBy(desc(leads.tempScore))
      .limit(10);
    const rules = await emailRules(client.id, "warm");
    if (!cold.length || !rules.length) continue;
    const title = `${client.name}: weekly watchlist`;
    const body =
      `${cold.length} accounts on the cold watchlist. They'll alert you if they heat up.\n\n` +
      cold.map((r) => `• ${r.company.name} — ${r.lead.tempScore}/100`).join("\n");
    for (const rule of rules) {
      try {
        await deliver(rule, title, body, {});
      } catch (e) {
        console.warn(`[cold-summary] ${(e as Error).message}`);
      }
    }
    await db.insert(alertsSent).values({ agencyId: client.agencyId, clientId: client.id, channel: "summary-cold", status: "sent", detail: `${cold.length} accounts` });
    sent++;
  }
  return { clients: sent };
}

/** Drafts are in and simulated: lead → ready, then alert. */
export async function markReady(agencyId: string, leadId: string) {
  const [winner] = await db.select({ id: drafts.id }).from(drafts).where(and(eq(drafts.leadId, leadId), eq(drafts.status, "winner")));
  if (!winner) return;
  await db.update(leads).set({ status: "ready" }).where(and(eq(leads.agencyId, agencyId), eq(leads.id, leadId)));
  await enqueue(Q.alert, { agencyId, leadId });
}
