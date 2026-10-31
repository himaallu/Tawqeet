import { and, eq, inArray } from "drizzle-orm";
import { db, agencies, leads, companies, alertsLog } from "@workspace/db";
import { sendEmail, demoRecipient } from "./resend";
import { appOrigin } from "./config";
import { audit } from "./compliance";

const origin = () => { try { return appOrigin(); } catch { return ""; } };
type Kind = "warm" | "cold";

/** Warm: leads not yet included in a warm digest. Cold: weekly watchlist summary. Never throws. */
export async function sendDigest(agencyId: string, kind: Kind): Promise<{ status: string; message: string }> {
  const channel = kind === "warm" ? "warm-digest" : "cold-weekly";
  let status = "sent", error: string | null = null, message = "";
  try {
    const rows = await db.select({ lead: leads, company: companies }).from(leads).innerJoin(companies, eq(companies.id, leads.companyId))
      .where(and(eq(leads.agencyId, agencyId), eq(leads.temperature, kind)));
    let list = rows.sort((a, b) => b.lead.tempScore - a.lead.tempScore);
    if (kind === "warm") {
      const done = list.length ? await db.select({ leadId: alertsLog.leadId }).from(alertsLog)
        .where(and(eq(alertsLog.agencyId, agencyId), eq(alertsLog.channel, channel), eq(alertsLog.status, "sent"),
          inArray(alertsLog.leadId, list.map(r => r.lead.id)))) : [];
      list = list.filter(r => !done.some(d => d.leadId === r.lead.id));
    }
    if (!list.length) return { status: "skipped", message: kind === "warm" ? "No new Warm leads since the last digest." : "No Cold leads on the watchlist." };
    const to = demoRecipient();
    if (!to) throw new Error("ALERT_EMAIL_TO / OWNER_EMAIL is not configured.");
    const lines = list.slice(0, 50).map(r => `• ${r.lead.fullName} (${r.lead.title || "—"}) · ${r.company.name} · score ${r.lead.tempScore} · ${origin()}/leads/${r.lead.id}`);
    const subject = kind === "warm" ? `Tawqeet: ${list.length} new Warm lead${list.length > 1 ? "s" : ""}` : `Tawqeet weekly Cold watchlist: ${list.length} lead${list.length > 1 ? "s" : ""}`;
    const intro = kind === "warm" ? "New Warm leads (score 35–69). Review drafts before they cool down:" : "Cold watchlist (score under 35). Signals may still arrive; no action needed yet:";
    await sendEmail({ to, subject, text: [intro, "", ...lines, "", `Open Tawqeet: ${origin()}/radar`].join("\n") });
    message = `${kind === "warm" ? "Warm digest" : "Cold weekly summary"} sent to ${to} (${list.length} leads).`;
    if (kind === "warm") await db.insert(alertsLog).values(list.map(r => ({ agencyId, leadId: r.lead.id, channel, status: "sent", score: r.lead.tempScore })));
    else await db.insert(alertsLog).values({ agencyId, channel, status: "sent", error: `${list.length} leads` });
  } catch (e) {
    status = "failed"; error = e instanceof Error ? e.message.slice(0, 300) : "Digest failed"; message = `Digest not sent: ${error}`;
    await db.insert(alertsLog).values({ agencyId, channel, status, error }).catch(() => undefined);
  }
  await audit(agencyId, null, `digest.${kind}`, message, { status, error });
  return { status, message };
}
export async function sendDigestAllAgencies(kind: Kind) {
  for (const a of await db.select({ id: agencies.id }).from(agencies)) await sendDigest(a.id, kind);
}
