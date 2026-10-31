import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../server/db";
import { agencies, aiUsage, brainEntries, leads, mailboxes, plays, sends, suppression } from "../server/db/schema";
import { devOutbox } from "../server/lib/mail";
import { performSend } from "../server/services/sending";
import { agent, drain, queued, resetDb, startApp } from "./helpers";

let base = "";
let close: () => Promise<unknown>;

beforeAll(async () => {
  ({ base, close } = await startApp());
});
afterAll(async () => close());
beforeEach(resetDb);

async function owner(email = "owner@falcon.ae", agencyName = "Falcon Outbound") {
  const a = agent(base);
  await a.signIn(email);
  expect((await a.post("/api/onboarding", { name: agencyName })).status).toBe(200);
  return a;
}

const clientBody = {
  name: "Marsa Logistics",
  website: "https://marsa.example",
  verticals: ["Logistics"],
  regions: ["AE", "SA"],
  languages: ["en"],
  offer: "Bonded warehouse capacity in Jebel Ali with 48-hour onboarding",
  proofPoints: ["Retail clients cut stock transfer time by 30%"],
  noGoClaims: ["cheapest in the GCC"],
  icp: { titles: ["VP Supply Chain"], industries: ["retail"] },
};

describe("auth + onboarding", () => {
  it("signs in by magic link, creates one agency with the play library", async () => {
    const a = agent(base);
    expect((await a.get("/api/me")).status).toBe(401);
    await a.signIn("founder@agency.ae");
    const me = await a.get("/api/me");
    expect(me.body.user.email).toBe("founder@agency.ae");
    expect(me.body.agency).toBeNull();

    await a.post("/api/onboarding", { name: "First" });
    await a.post("/api/onboarding", { name: "Second" }); // no second agency
    const after = await a.get("/api/me");
    expect(after.body.agency.name).toBe("First");
    expect(after.body.user.role).toBe("owner");
    const p = await db.select().from(plays).where(eq(plays.agencyId, after.body.agency.id));
    expect(p.length).toBe(24); // 12 signals × EN/AR
  });

  it("rejects reused and unknown magic links", async () => {
    const a = agent(base);
    await a.post("/api/auth/request", { email: "x@agency.ae" });
    const url = new URL(devOutbox.at(-1)!.text.match(/https?:\/\/\S+verify\?\S+/)![0]);
    expect((await a.get(url.pathname + url.search)).headers.get("location")).toBe("/app");
    const b = agent(base);
    expect((await b.get(url.pathname + url.search)).headers.get("location")).toBe("/login?error=expired");
    expect((await b.get("/api/auth/verify?token=nope")).headers.get("location")).toBe("/login?error=expired");
  });
});

describe("tenancy", () => {
  it("never shows one agency's clients, leads or drafts to another", async () => {
    const a = await owner("a@one.ae", "One");
    const b = await owner("b@two.ae", "Two");
    const c = (await a.post("/api/clients", clientBody)).body;
    expect((await b.get("/api/clients")).body).toEqual([]);
    expect((await b.get(`/api/clients/${c.id}`)).status).toBe(404);
    expect((await b.patch(`/api/clients/${c.id}`, { name: "hijack" })).status).toBe(404);
    expect((await b.get(`/api/leads?clientId=${c.id}`)).status).toBe(404);
    expect((await b.get(`/api/clients/${c.id}/brain`)).status).toBe(404);
    expect((await a.get(`/api/clients/${c.id}`)).body.name).toBe("Marsa Logistics");
  });

  it("pins client viewers to their own client and keeps them read-only", async () => {
    const a = await owner();
    const c1 = (await a.post("/api/clients", clientBody)).body;
    const c2 = (await a.post("/api/clients", { ...clientBody, name: "Sahab Cloud" })).body;
    expect((await a.post("/api/team/invite", { email: "viewer@marsa.example", role: "client_viewer", clientId: c1.id })).status).toBe(200);
    const v = agent(base);
    await v.signIn("viewer@marsa.example");
    const list = (await v.get("/api/clients")).body;
    expect(list.map((c: { name: string }) => c.name)).toEqual(["Marsa Logistics"]);
    expect((await v.get(`/api/clients/${c2.id}`)).status).toBe(404);
    expect((await v.post("/api/clients", clientBody)).status).toBe(403);
    expect((await v.get(`/api/clients/${c1.id}/report`)).status).toBe(200);
    expect((await v.post("/api/radar/signals", {})).status).toBe(403);
  });
});

describe("signal → lead → drafts → simulated inbox → alert → send → reply", () => {
  it("runs the whole pipeline with a human clicking Send", async () => {
    const a = await owner();
    const client = (await a.post("/api/clients", clientBody)).body;
    await a.post(`/api/clients/${client.id}/alert-rules`, { minTemperature: "hot", channel: "email", target: "bd@marsa.example" });
    await a.post(`/api/clients/${client.id}/mailboxes/connect`, { provider: "demo", email: "growth@marsa.example" });

    // Two stacked signals on the same company → Hot.
    for (const s of [
      { definitionKey: "funding_round", title: "Noor Retail Group raises AED 120M Series B to expand across the GCC" },
      { definitionKey: "expansion_new_market", title: "Noor Retail Group expands into Saudi Arabia with 12 stores" },
    ]) {
      const r = await a.post("/api/radar/signals", { companyName: "Noor Retail Group", domain: "noorretail.example", country: "AE", ...s, summary: s.title });
      expect(r.status).toBe(200);
    }
    expect((await a.post("/api/radar/signals", { companyName: "Noor Retail Group", domain: "noorretail.example", country: "AE", definitionKey: "funding_round", title: "Noor Retail Group raises AED 120M Series B to expand across the GCC" })).status).toBe(409);

    await drain();

    const [lead] = (await a.get(`/api/leads?clientId=${client.id}`)).body;
    expect(lead.company.name).toBe("Noor Retail Group");
    expect(lead.temperature).toBe("hot");
    expect(lead.status).toBe("ready");
    expect(lead.breakdown.stackBonus).toBe(10);
    expect(lead.signals.length).toBe(2);

    const detail = (await a.get(`/api/leads/${lead.id}`)).body;
    expect(detail.drafts).toHaveLength(3);
    expect(detail.drafts.map((d: { angle: string }) => d.angle)).toEqual(["outcome", "signal", "proof"]);
    for (const d of detail.drafts) {
      expect(d.body).toContain("Reply 'stop'");
      expect(d.body).not.toMatch(/cheapest in the GCC/i);
      expect(d.score).toBeGreaterThan(0);
      expect(d.simRuns.filter((r: { check: string }) => r.check === "persona")).toHaveLength(6);
      expect(d.simRuns.map((r: { check: string }) => r.check)).toEqual(expect.arrayContaining(["gmail_summary", "apple_preview", "spam"]));
    }
    expect(detail.drafts.filter((d: { status: string }) => d.status === "winner")).toHaveLength(1);

    // Hot alert went to the client's alert email.
    expect(devOutbox.some((m) => m.to === "bd@marsa.example" && m.subject.includes("Noor Retail Group"))).toBe(true);

    // Nothing is queued for sending until a human approves.
    expect(await db.select().from(sends)).toHaveLength(0);
    expect((await a.post(`/api/drafts/${detail.presentedDraftId}/send`, {})).status).toBe(400); // must confirm
    const sent = await a.post(`/api/drafts/${detail.presentedDraftId}/send`, { confirm: true });
    expect(sent.status).toBe(200);
    expect(queued.some((j) => j.name === "send-email")).toBe(true);
    expect((await a.post(`/api/drafts/${detail.presentedDraftId}/send`, { confirm: true })).status).toBe(400); // no double send

    const [row] = await db.select().from(sends);
    expect(row.approvedBy).toBeTruthy();
    await db.update(sends).set({ scheduledFor: new Date(Date.now() - 1000) }).where(eq(sends.id, row.id));
    expect((await performSend(row.agencyId, row.id)).status).toBe("sent");

    // Reply arrives at the tracking alias → classified, learning written, lead marked replied.
    const reply = await fetch(`${base}/api/inbound?secret=inbound-secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ToFull: [{ Email: `r+${row.replyToken}@in.tawqeet.test` }], From: "Rania <rania@noorretail.example>", Subject: "Re", StrippedTextReply: "Sounds good, Tuesday works" }),
    });
    expect((await reply.json()).kind).toBe("positive");
    const [after] = await db.select().from(sends);
    expect(after.replyClass).toBe("positive");
    const learnings = await db.select().from(brainEntries).where(eq(brainEntries.kind, "learning"));
    expect(learnings).toHaveLength(1);
    expect(learnings[0].meta).toMatchObject({ reply_class: "positive", signal_key: expect.any(String) });
    const [l2] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(l2.status).toBe("replied");
    expect(l2.tempScore).toBeGreaterThan(lead.tempScore); // replied → +15 engagement

    const audit = (await a.get("/api/audit")).body;
    expect(audit.some((e: { action: string }) => e.action === "send.approved")).toBe(true);
    const cal = (await a.get("/api/calibration")).body;
    expect(cal.total).toBe(1);
    expect((await db.select().from(aiUsage)).length).toBeGreaterThan(10);
  });

  it("honours unsubscribe links and blocks free-mail and suppressed contacts", async () => {
    const a = await owner();
    const client = (await a.post("/api/clients", clientBody)).body;
    await a.post(`/api/clients/${client.id}/mailboxes/connect`, { provider: "demo" });
    await a.post("/api/radar/signals", { companyName: "Delma Foods", domain: "delmafoods.example", country: "AE", definitionKey: "tender_published", title: "Delma Foods tender for warehousing in Dubai" });
    await a.post("/api/radar/signals", { companyName: "Delma Foods", domain: "delmafoods.example", country: "AE", definitionKey: "office_opening", title: "Delma Foods opens Jebel Ali distribution centre" });
    await drain();
    const [lead] = (await a.get(`/api/leads?clientId=${client.id}`)).body;
    const detail = (await a.get(`/api/leads/${lead.id}`)).body;
    expect((await a.post(`/api/drafts/${detail.presentedDraftId}/send`, { confirm: true })).status).toBe(200);
    const [row] = await db.select().from(sends);

    const page = await fetch(`${base}/api/public/unsubscribe/${row.replyToken}`);
    expect(await page.text()).toContain("unsubscribed");
    expect((await db.select().from(suppression)).map((s) => s.email)).toContain(lead.email);
    await db.update(sends).set({ scheduledFor: new Date(Date.now() - 1000) }).where(eq(sends.id, row.id));
    expect((await performSend(row.agencyId, row.id)).status).toBe("cancelled");

    await db.update(leads).set({ email: "someone@gmail.com", status: "ready" }).where(eq(leads.id, lead.id));
    await db.delete(sends);
    const other = detail.drafts.find((d: { id: string }) => d.id !== detail.presentedDraftId);
    const r = await a.post(`/api/drafts/${other.id}/send`, { confirm: true });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Free-mail/);
  });

  it("queues sends with a 2–6 minute gap and respects the daily cap", async () => {
    const a = await owner();
    const client = (await a.post("/api/clients", clientBody)).body;
    await a.post(`/api/clients/${client.id}/mailboxes/connect`, { provider: "demo" });
    await db.update(mailboxes).set({ dailyCap: 2 });
    for (const [i, name] of ["Alpha Retail", "Beta Retail", "Gamma Retail"].entries()) {
      await a.post("/api/radar/signals", { companyName: name, domain: `${name.split(" ")[0].toLowerCase()}.example`, country: "AE", definitionKey: "funding_round", title: `${name} raises funding round ${i}` });
      await a.post("/api/radar/signals", { companyName: name, domain: `${name.split(" ")[0].toLowerCase()}.example`, country: "AE", definitionKey: "office_opening", title: `${name} opens new office ${i}` });
    }
    await drain();
    const review = (await a.get(`/api/review?clientId=${client.id}`)).body;
    expect(review).toHaveLength(3);
    for (const item of review) expect((await a.post(`/api/drafts/${item.draft.id}/send`, { confirm: true })).status).toBe(200);
    const rows = (await db.select().from(sends)).sort((x, y) => x.scheduledFor.getTime() - y.scheduledFor.getTime());
    const gap = (rows[1].scheduledFor.getTime() - rows[0].scheduledFor.getTime()) / 60_000;
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(6.01);
    expect(rows[2].scheduledFor.getTime() - rows[0].scheduledFor.getTime()).toBeGreaterThan(6 * 3_600_000); // pushed to the next day
  });
});

describe("plan limits", () => {
  it("limits trial agencies to 2 client workspaces", async () => {
    const a = await owner();
    expect((await a.post("/api/clients", clientBody)).status).toBe(200);
    expect((await a.post("/api/clients", { ...clientBody, name: "Two" })).status).toBe(200);
    const third = await a.post("/api/clients", { ...clientBody, name: "Three" });
    expect(third.status).toBe(402);
    const [ag] = await db.select().from(agencies);
    await db.update(agencies).set({ plan: "agency", subscriptionStatus: "active" }).where(eq(agencies.id, ag.id));
    expect((await a.post("/api/clients", { ...clientBody, name: "Three" })).status).toBe(200);
  });

  it("exports and erases a contact, keeping them suppressed", async () => {
    const a = await owner();
    const client = (await a.post("/api/clients", clientBody)).body;
    await a.post("/api/radar/signals", { companyName: "Omega Foods", domain: "omega.example", country: "AE", definitionKey: "funding_round", title: "Omega Foods raises seed round" });
    await a.post("/api/radar/signals", { companyName: "Omega Foods", domain: "omega.example", country: "AE", definitionKey: "office_opening", title: "Omega Foods opens Dubai office" });
    await drain();
    const [lead] = (await a.get(`/api/leads?clientId=${client.id}`)).body;
    const exp = await a.get(`/api/contacts/export?email=${encodeURIComponent(lead.email)}`);
    expect(exp.body.leads[0].email).toBe(lead.email);
    expect((await a.del("/api/contacts", { email: lead.email })).body.deleted).toBe(1);
    expect(await db.select().from(leads).where(and(eq(leads.email, lead.email)))).toHaveLength(0);
    expect((await db.select().from(suppression)).some((s) => s.email === lead.email)).toBe(true);
  });
});
