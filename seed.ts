import "./server/lib/load-env";
process.env.AI_OFFLINE = "1"; // the demo must work offline and deterministically

import { createHash } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "./server/db";
import {
  agencies,
  alertRules,
  brainEntries,
  caseStudies,
  clientAccounts,
  clients,
  companies,
  drafts,
  leads,
  mailboxes,
  plays,
  radarSources,
  sends,
  signalDefinitions,
  signals,
  users,
} from "./server/db/schema";
import { runJobsInline } from "./server/lib/jobs";
import { recordLearning } from "./server/services/brain";
import { abGroupFor } from "./server/services/pipeline";
import { DEFAULT_RADAR_SOURCES, DEFAULT_SIGNAL_DEFINITIONS, defaultPlays } from "./server/services/play-library";
import { recomputeAccount } from "./server/services/scoring";
import { simulateLead } from "./server/services/simulate";
import { generateDrafts } from "./server/services/writer";

/**
 * Demo data so the app works offline. Re-runnable: wipes and recreates the demo agency and the
 * demo companies. All companies and people are fictional (.example domains).
 *
 * Sign in as demo@tawqeet.demo (owner). Without Resend, the magic link prints in the server log.
 * Also: member@tawqeet.demo (member), viewer@tawqeet.demo (client viewer for Sahab Cloud).
 */
const AGENCY_ID = "00000000-0000-4000-8000-000000000001";
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

async function referenceData() {
  for (const d of DEFAULT_SIGNAL_DEFINITIONS) {
    await db.insert(signalDefinitions).values(d).onConflictDoNothing({ target: signalDefinitions.key });
  }
  for (const s of DEFAULT_RADAR_SOURCES) await db.insert(radarSources).values(s).onConflictDoNothing({ target: radarSources.url });
}

async function main() {
  runJobsInline(async () => {}); // seeding drives the pipeline steps directly; nothing is queued
  await referenceData();

  await db.delete(agencies).where(eq(agencies.id, AGENCY_ID)); // cascades to all agency data
  await db.delete(companies).where(sql`${companies.domain} like '%.example'`);

  await db.insert(agencies).values({ id: AGENCY_ID, name: "Falcon Outbound", plan: "agency", subscriptionStatus: "active" });
  await db.insert(plays).values(defaultPlays(AGENCY_ID));

  const [sahab, marsa] = await db
    .insert(clients)
    .values([
      {
        agencyId: AGENCY_ID,
        name: "Sahab Cloud",
        website: "https://sahabcloud.example",
        verticals: ["HR tech", "Payroll"],
        regions: ["AE", "SA", "QA"],
        languages: ["en", "ar"],
        offer: "Sahab Cloud runs payroll, WPS and onboarding for GCC companies in one compliant platform",
        icp: {
          titles: ["HR Director", "Chief People Officer", "Head of HR", "CFO"],
          company_sizes: ["201-500", "501-1000", "1001-5000"],
          industries: ["healthcare", "banking", "technology"],
          pains: ["Manual payroll across UAE and KSA", "WPS compliance errors", "Slow onboarding for fast hiring"],
          deal_size: "USD 25k–80k ARR",
        },
        tone: "Warm, precise, no hype",
        noGoClaims: ["guaranteed savings", "100% compliance", "replace your HR team"],
        proofPoints: [
          "Clients run payroll in 2 days instead of 9",
          "Onboarding paperwork cut from 3 hours to 25 minutes per hire",
          "عملاؤنا يُنهون مسيّر الرواتب في يومين بدلاً من ٩ أيام",
        ],
        differentiators: ["Native WPS and Mudad integration", "Arabic-first employee app"],
        timezone: "Asia/Dubai",
      },
      {
        agencyId: AGENCY_ID,
        name: "Marsa Logistics",
        website: "https://marsalogistics.example",
        verticals: ["Logistics", "Warehousing"],
        regions: ["SA", "AE", "OM"],
        languages: ["en", "ar"],
        offer: "Marsa Logistics adds bonded warehouse capacity in Jebel Ali and Dammam with 48-hour onboarding",
        icp: {
          titles: ["VP Supply Chain", "Head of Logistics", "COO", "Procurement Manager"],
          company_sizes: ["201-500", "501-1000", "1001-5000"],
          industries: ["retail", "food", "manufacturing"],
          pains: ["Warehouse space during expansion", "Cross-border stock transfers", "Peak-season capacity"],
          deal_size: "USD 60k–250k per year",
        },
        tone: "Direct, operational, respectful",
        noGoClaims: ["cheapest in the GCC", "zero damage"],
        proofPoints: ["Retail clients cut GCC stock transfer time by 30%", "Onboarding in 48 hours", "تفعيل المساحات التخزينية خلال ٤٨ ساعة"],
        differentiators: ["Bonded space in Jebel Ali and Dammam", "Arabic-speaking account managers"],
        timezone: "Asia/Riyadh",
      },
    ])
    .returning();

  const [owner] = await db
    .insert(users)
    .values({ email: "demo@tawqeet.demo", name: "Aisha (Owner)", agencyId: AGENCY_ID, role: "owner" })
    .onConflictDoUpdate({ target: users.email, set: { agencyId: AGENCY_ID, role: "owner", clientId: null } })
    .returning();
  await db
    .insert(users)
    .values([
      { email: "member@tawqeet.demo", name: "Hamza (SDR)", agencyId: AGENCY_ID, role: "member" },
      { email: "viewer@tawqeet.demo", name: "Sahab Cloud viewer", agencyId: AGENCY_ID, role: "client_viewer", clientId: sahab.id },
    ])
    .onConflictDoNothing();
  await db.update(users).set({ agencyId: AGENCY_ID, role: "client_viewer", clientId: sahab.id }).where(eq(users.email, "viewer@tawqeet.demo"));

  // ---------- brain + case studies ----------
  await db.insert(brainEntries).values([
    { agencyId: AGENCY_ID, clientId: sahab.id, kind: "website", content: "Payroll, WPS and onboarding for GCC companies.", meta: { url: "https://sahabcloud.example", pages: ["https://sahabcloud.example", "https://sahabcloud.example/customers"] } },
    { agencyId: AGENCY_ID, clientId: sahab.id, kind: "form", content: "HR and finance leaders at 200–2,000 person companies in UAE, KSA and Qatar that are hiring fast.", meta: { dealSize: "USD 25k–80k ARR", languages: ["en", "ar"] } },
    { agencyId: AGENCY_ID, clientId: marsa.id, kind: "website", content: "Bonded warehousing and cross-border freight across the GCC.", meta: { url: "https://marsalogistics.example" } },
    { agencyId: AGENCY_ID, clientId: marsa.id, kind: "crm", content: "Won: Peak-season overflow (a Dubai fashion retailer) · Retail", meta: { source: "demo" } },
  ]);
  await db.insert(caseStudies).values([
    { agencyId: AGENCY_ID, clientId: sahab.id, customerName: "Gulf Care Clinics", customerVertical: "Healthcare", customerCountry: "SA", customerSizeBand: "501-1000", problem: "Payroll for 700 staff across two countries took 9 days", solution: "Moved payroll and WPS to Sahab", resultMetric: "payroll closed in 2 days instead of 9", resultValue: "2 days", timeframe: "first quarter", canNameCustomer: false, language: "en", source: "form", approved: true },
    { agencyId: AGENCY_ID, clientId: sahab.id, customerName: "Al Noor Exchange", customerVertical: "Banking", customerCountry: "AE", customerSizeBand: "1001-5000", problem: "Onboarding paperwork slowed hiring", solution: "Arabic-first onboarding app", resultMetric: "onboarding paperwork cut from 3 hours to 25 minutes per hire", resultValue: "25 minutes", timeframe: "6 weeks", quote: "Our new joiners are productive on day one.", quotePersonTitle: "Head of People", canNameCustomer: true, language: "en", source: "upload", sourceRef: "al-noor-case-study.pdf", approved: true },
    { agencyId: AGENCY_ID, clientId: sahab.id, customerName: "مجموعة رعاية طبية", customerVertical: "Healthcare", customerCountry: "SA", customerSizeBand: "501-1000", problem: "إعداد الرواتب لـ ٧٠٠ موظف في دولتين", solution: "نقل الرواتب وحماية الأجور إلى سحاب", resultMetric: "تقلّصت مدة إعداد الرواتب من ٩ أيام إلى يومين", resultValue: "يومان", timeframe: "الربع الأول", canNameCustomer: false, language: "ar", source: "form", approved: true },
    { agencyId: AGENCY_ID, clientId: sahab.id, customerName: "Draft: Retail group", customerVertical: "Retail", customerCountry: "QA", problem: "Seasonal hiring", resultMetric: "pending numbers", canNameCustomer: false, language: "en", source: "website", approved: false },
    { agencyId: AGENCY_ID, clientId: marsa.id, customerName: "Desert Bloom Fashion", customerVertical: "Retail", customerCountry: "AE", customerSizeBand: "201-500", problem: "Stock transfers between Dubai and Riyadh took 6 days", solution: "Bonded cross-dock in Jebel Ali", resultMetric: "GCC stock transfer time cut by 30%", resultValue: "30%", timeframe: "3 months", canNameCustomer: false, language: "en", source: "form", approved: true },
    { agencyId: AGENCY_ID, clientId: marsa.id, customerName: "Hijaz Foods", customerVertical: "Food", customerCountry: "SA", customerSizeBand: "501-1000", problem: "No overflow space during Ramadan peak", solution: "Flexible bonded space in Dammam", resultMetric: "onboarded in 48 hours for Ramadan peak", resultValue: "48 hours", timeframe: "2 weeks", canNameCustomer: true, language: "en", source: "url", sourceRef: "https://marsalogistics.example/customers/hijaz", approved: true },
  ]);

  // ---------- companies + 10 Gulf signals ----------
  const co = await db
    .insert(companies)
    .values([
      { name: "Noor Retail Group", domain: "noorretail.example", country: "AE", vertical: "Retail", sizeBand: "1001-5000", careersUrl: "https://noorretail.example/careers" },
      { name: "Delma Foods", domain: "delmafoods.example", country: "AE", vertical: "Food", sizeBand: "501-1000" },
      { name: "Sharqiya Industrial Co.", domain: "sharqiya.example", country: "SA", vertical: "Manufacturing", sizeBand: "501-1000" },
      { name: "Bustan Hypermarkets", domain: "bustan.example", country: "OM", vertical: "Retail", sizeBand: "201-500" },
      { name: "Qamar Health", domain: "qamarhealth.example", country: "SA", vertical: "Healthcare", sizeBand: "1001-5000" },
      { name: "Wahat Bank", domain: "wahatbank.example", country: "QA", vertical: "Banking", sizeBand: "1001-5000" },
      { name: "Rimal Tech", domain: "rimaltech.example", country: "SA", vertical: "Technology", sizeBand: "201-500" },
    ])
    .returning();
  const C = Object.fromEntries(co.map((c) => [c.name, c]));

  const sig = [
    { c: "Noor Retail Group", key: "funding_round", d: 1, title: "Noor Retail Group raises AED 120M Series B to expand across the GCC", lang: "en", src: "Zawya — Business" },
    { c: "Noor Retail Group", key: "hiring_sales_role", d: 3, title: "Noor Retail Group is hiring: Regional Sales Director, KSA Sales Manager", lang: "en", src: "careers page" },
    { c: "Delma Foods", key: "office_opening", d: 3, title: "Delma Foods opens second distribution centre in Jebel Ali", lang: "en", src: "Gulf News — Business" },
    { c: "Delma Foods", key: "partnership_announced", d: 12, title: "Delma Foods signs supply partnership with a Saudi hypermarket chain", lang: "en", src: "Arabian Business" },
    { c: "Sharqiya Industrial Co.", key: "tender_published", d: 2, title: "مناقصة لتوريد خدمات التخزين والتوزيع في المنطقة الشرقية", lang: "ar", src: "Saudi tenders (demo)" },
    { c: "Bustan Hypermarkets", key: "partnership_announced", d: 6, title: "Bustan Hypermarkets signs Oman logistics partnership", lang: "en", src: "Google News: Retail Oman" },
    { c: "Qamar Health", key: "hiring_relevant_role", d: 2, title: "Qamar Health is hiring 300 staff for new Riyadh clinics", lang: "en", src: "Google News: Healthcare Saudi" },
    { c: "Wahat Bank", key: "leadership_change", d: 4, title: "Wahat Bank appoints new Chief People Officer", lang: "en", src: "The National — Business" },
    { c: "Rimal Tech", key: "expansion_new_market", d: 5, title: "شركة رمال للتقنية تفتتح مقراً إقليمياً جديداً في الرياض", lang: "ar", src: "Wamda" },
    { c: "Rimal Tech", key: "hiring_relevant_role", d: 2, title: "Rimal Tech posts 45 HR and finance roles in Riyadh", lang: "en", src: "careers page" },
  ];
  await db.insert(signals).values(
    sig.map((s) => ({
      companyId: C[s.c].id,
      definitionKey: s.key,
      title: s.title,
      summary: s.title,
      url: `https://news.example/${hash(s.title).slice(0, 12)}`,
      source: s.src,
      language: s.lang,
      detectedAt: ago(s.d),
      dedupeKey: hash(`demo|${s.title}`),
    })),
  );

  // ---------- accounts + leads ----------
  const people = [
    { client: marsa, c: "Noor Retail Group", fit: 22, name: "Rania Haddad", title: "VP Supply Chain", lang: "en", why: "Fresh Series B to expand across the GCC means new warehouse capacity, fast." },
    { client: marsa, c: "Delma Foods", fit: 20, name: "Omar Siddiqui", title: "Head of Logistics", lang: "en", why: "A second Jebel Ali distribution centre plus a Saudi supply deal means cross-border stock moves." },
    { client: marsa, c: "Sharqiya Industrial Co.", fit: 19, name: "خالد الدوسري", title: "مدير المشتريات", lang: "ar", why: "مناقصة جديدة لخدمات التخزين والتوزيع في المنطقة الشرقية." },
    { client: marsa, c: "Bustan Hypermarkets", fit: 12, name: "Salim Al Harthy", title: "COO", lang: "en", why: "New Oman logistics partnership; worth watching." },
    { client: sahab, c: "Qamar Health", fit: 20, name: "Faisal Al-Otaibi", title: "HR Director", lang: "en", why: "Hiring 300 staff for new Riyadh clinics puts pressure on payroll and onboarding." },
    { client: sahab, c: "Wahat Bank", fit: 21, name: "Mariam Al-Kuwari", title: "Chief People Officer", lang: "en", why: "A new Chief People Officer usually reviews HR systems in the first 100 days." },
    { client: sahab, c: "Rimal Tech", fit: 21, name: "نورة القحطاني", title: "مديرة الموارد البشرية", lang: "ar", why: "مقر إقليمي جديد في الرياض و٤٥ وظيفة جديدة في الموارد البشرية والمالية." },
  ];
  const leadIds: string[] = [];
  for (const p of people) {
    const company = C[p.c];
    const [account] = await db
      .insert(clientAccounts)
      .values({ agencyId: AGENCY_ID, clientId: p.client.id, companyId: company.id, fit: p.fit, fitReason: `Matches ${p.client.name}'s ICP: ${company.vertical}, ${company.sizeBand} staff, ${company.country}.`, whyNow: p.why })
      .returning();
    const local = p.lang === "ar" ? ["khalid", "noura"][leadIds.length % 2] : p.name.split(" ")[0].toLowerCase();
    const email = `${local}@${company.domain}`;
    const [lead] = await db
      .insert(leads)
      .values({
        agencyId: AGENCY_ID,
        clientId: p.client.id,
        companyId: company.id,
        accountId: account.id,
        fullName: p.name,
        title: p.title,
        email,
        emailVerified: "verified",
        whyNow: p.why,
        language: p.lang,
        abGroup: abGroupFor(`${p.client.id}:${email}`),
        consentNote: `B2B outreach on legitimate interest: ${p.why}`,
      })
      .returning();
    await recomputeAccount(AGENCY_ID, account.id);
    leadIds.push(lead.id);
  }

  // Warm + hot leads get drafts and a simulated inbox, exactly as the pipeline would.
  const active = await db.select().from(leads).where(inArray(leads.id, leadIds));
  for (const l of active) {
    if (l.temperature === "cold") continue;
    await generateDrafts(AGENCY_ID, l.id, { queueSimulation: false });
    await simulateLead(AGENCY_ID, l.id);
  }

  // ---------- mailboxes + alerts ----------
  const [sahabBox, marsaBox] = await db
    .insert(mailboxes)
    .values([
      { agencyId: AGENCY_ID, clientId: sahab.id, provider: "demo", email: "growth@sahabcloud.example", dailyCap: 30 },
      { agencyId: AGENCY_ID, clientId: marsa.id, provider: "demo", email: "partnerships@marsalogistics.example", dailyCap: 30 },
    ])
    .returning();
  await db.insert(alertRules).values([
    { agencyId: AGENCY_ID, clientId: sahab.id, minTemperature: "warm", channel: "email", target: "sales@sahabcloud.example" },
    { agencyId: AGENCY_ID, clientId: marsa.id, minTemperature: "hot", channel: "email", target: "bd@marsalogistics.example" },
    { agencyId: AGENCY_ID, clientId: marsa.id, minTemperature: "hot", channel: "webhook", target: "https://hooks.example/marsa", active: false },
  ]);

  // ---------- history: past sends so Calibration and Reports have real numbers ----------
  const past = [
    ["Al Fajr Trading", "Retail", marsa, 84, "positive", 4, true],
    ["Saqr Freight", "Logistics", marsa, 78, "positive", 9, false],
    ["Oasis Dairy", "Food", marsa, 72, "neutral", 6, false],
    ["Jazeera Mart", "Retail", marsa, 66, null, 12, false],
    ["Raya Plastics", "Manufacturing", marsa, 58, "negative", 15, false],
    ["Tilal Home", "Retail", marsa, 45, null, 20, false],
    ["Barakah Clinics", "Healthcare", sahab, 88, "positive", 3, true],
    ["Seef Insurance", "Banking", sahab, 81, "neutral", 5, false],
    ["Mada Engineering", "Technology", sahab, 74, "positive", 8, false],
    ["Thuraya Schools", "Education", sahab, 63, "ooo", 10, false],
    ["Nakheel Pharma", "Healthcare", sahab, 55, null, 16, false],
    ["Wadi Hotels", "Hospitality", sahab, 38, "unsubscribe", 25, false],
  ] as const;
  for (const [name, vertical, client, score, reply, days, meeting] of past) {
    const domain = `${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`;
    const [company] = await db.insert(companies).values({ name, domain, country: client.id === sahab.id ? "AE" : "SA", vertical, sizeBand: "201-500" }).returning();
    const [lead] = await db
      .insert(leads)
      .values({ agencyId: AGENCY_ID, clientId: client.id, companyId: company.id, fullName: "Past contact", title: "Head of Operations", email: `ops@${domain}`, emailVerified: "verified", status: reply ? (reply === "unsubscribe" ? "closed" : "replied") : "sent", tempScore: score - 10, temperature: score >= 80 ? "hot" : score >= 50 ? "warm" : "cold" })
      .returning();
    const [draft] = await db
      .insert(drafts)
      .values({ agencyId: AGENCY_ID, clientId: client.id, leadId: lead.id, variant: 1, angle: "signal", subject: `${name}: quick question`, body: "Demo history email.\n\nNot relevant? Reply 'stop' and I won't email again.", score, status: "sent" })
      .returning();
    const [send] = await db
      .insert(sends)
      .values({
        agencyId: AGENCY_ID,
        clientId: client.id,
        draftId: draft.id,
        leadId: lead.id,
        mailboxId: client.id === sahab.id ? sahabBox.id : marsaBox.id,
        approvedBy: owner.id,
        toEmail: lead.email!,
        subject: draft.subject,
        body: draft.body,
        status: "sent",
        scheduledFor: ago(days),
        sentAt: ago(days),
        replyToken: hash(`reply|${name}`).slice(0, 16),
        repliedAt: reply ? ago(days - 1) : null,
        replyClass: reply,
        scoreAtSend: score,
        abGroup: name === "Oasis Dairy" || name === "Seef Insurance" ? "challenger" : "control",
        meetingBooked: meeting,
      })
      .returning();
    if (reply) {
      await recordLearning(AGENCY_ID, client.id, { signal_key: "funding_round", play_id: null, persona: "operations", vertical, language: "en", subject: send.subject, score, reply_class: reply });
    }
  }

  const [counts] = await db.execute<{ leads: number; ready: number; drafts: number }>(
    sql`select (select count(*) from leads where agency_id = ${AGENCY_ID})::int as leads,
               (select count(*) from leads where agency_id = ${AGENCY_ID} and status = 'ready')::int as ready,
               (select count(*) from drafts where agency_id = ${AGENCY_ID})::int as drafts`,
  ).then((r) => r.rows);
  console.log(
    `Seeded "Falcon Outbound": 2 clients, 10 Gulf signals, ${counts.leads} leads (${counts.ready} ready to review), ${counts.drafts} drafts, ${past.length} past sends.\n` +
      `Sign in as demo@tawqeet.demo (owner), member@tawqeet.demo, or viewer@tawqeet.demo (client viewer).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
