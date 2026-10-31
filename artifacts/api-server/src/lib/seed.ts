import { eq } from "drizzle-orm";
import { db, pool, agencies, clients, signalDefinitions, companies, signals, leads, drafts, leadSignals } from "@workspace/db";
import { logger } from "./logger";

const agencyId = "10000000-0000-4000-8000-000000000001";
const clientIds = ["20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000002"];
const definitions = [
  ["funding_round", "Funding round", "funding", 35, 30],
  ["expansion_new_market", "Expansion into a new market", "news", 30, 45],
  ["hiring_sales_role", "Hiring a sales role", "hiring", 25, 30],
  ["hiring_relevant_role", "Hiring a relevant role", "hiring", 25, 30],
  ["careers_page_new_roles", "New roles on careers page", "careers_page", 20, 21],
  ["leadership_change", "Leadership change", "leadership", 30, 60],
  ["tender_published", "Tender published", "tender", 35, 21],
  ["new_company_registration", "New company registration", "registry", 15, 90],
  ["product_launch", "Product launch", "news", 20, 30],
  ["partnership_announced", "Partnership announced", "news", 20, 30],
  ["event_exhibitor", "Event exhibitor (GITEX / Cityscape)", "news", 20, 14],
  ["office_opening", "Office opening", "news", 25, 45],
] as const;

export async function seed(): Promise<void> {
  await db.transaction(async tx => {
    await tx.insert(agencies).values({ id: agencyId, name: "Tawqeet Agency", plan: "foundation" }).onConflictDoNothing();
    const [agency] = await tx.select().from(agencies).where(eq(agencies.workspaceSlot, 1)).limit(1);
    if (!agency) throw new Error("Agency seed failed.");
    await tx.insert(clients).values([
      { id: clientIds[0], agencyId: agency.id, name: "Nakhla Technologies", website: "https://nakhla.example",
        verticals: ["Technology", "SaaS"], regions: ["United Arab Emirates", "Saudi Arabia"], languages: ["English", "Arabic"],
        offer: "Cloud infrastructure and managed IT services for growing Gulf businesses.",
        icp: { companySize: "50–500 employees", personas: ["CTO", "Head of IT"], markets: ["UAE", "KSA"] },
        tone: "Professional, clear and approachable", noGoClaims: ["Guaranteed cost savings", "Unverified customer claims"] },
      { id: clientIds[1], agencyId: agency.id, name: "Madar Advisory", website: "https://madar.example",
        verticals: ["Professional services", "Real estate"], regions: ["United Arab Emirates", "Qatar"], languages: ["English", "Arabic"],
        offer: "Market-entry and growth advisory for companies expanding across the GCC.",
        icp: { companySize: "20–200 employees", personas: ["CEO", "Managing Director"], markets: ["GCC"] },
        tone: "Confident, consultative and concise", noGoClaims: ["Guaranteed revenue", "Legal or investment advice"] },
    ]).onConflictDoNothing();
    for (const [key, name, sourceType, baseWeight, halfLifeDays] of definitions) {
      await tx.insert(signalDefinitions).values({ key, name, sourceType, baseWeight, halfLifeDays }).onConflictDoNothing();
    }
    const companyNames = ["Gulf Horizon", "Desert Cloud", "Falaj Logistics", "Oasis Ventures", "Dune Retail", "Pearl Health", "Crescent Systems", "Palm Estates", "Wadi Energy", "Majlis Digital"];
    for (let i = 0; i < 10; i++) {
      const suffix = String(i + 1).padStart(12, "0");
      const companyId = `30000000-0000-4000-8000-${suffix}`;
      const signalId = `40000000-0000-4000-8000-${suffix}`;
      await tx.insert(companies).values({ id: companyId, agencyId: agency.id, name: `${companyNames[i]} (Demo)`,
        domain: `demo-${i + 1}.example`, country: i % 2 ? "Saudi Arabia" : "United Arab Emirates", vertical: i % 2 ? "Professional services" : "Technology", sizeBand: "50–200" }).onConflictDoNothing();
      await tx.insert(signals).values({ id: signalId, agencyId: agency.id, companyId, definitionKey: definitions[i]![0],
        title: `[Demo] ${companyNames[i]}: ${definitions[i]![1]}`, source: "Offline demonstration — fictional",
        language: "en", raw: { demo: true, fictional: true } }).onConflictDoNothing();
    }
    // Data fixtures only. No signal discovery, enrichment, drafting or sending is implemented.
    for (let i = 0; i < 2; i++) {
      const suffix = String(i + 1).padStart(12, "0");
      const leadId = `50000000-0000-4000-8000-${suffix}`;
      await tx.insert(leads).values({ id: leadId, agencyId: agency.id, clientId: clientIds[i]!,
        companyId: `30000000-0000-4000-8000-${suffix}`, fullName: "Demo Contact", title: "Managing Director",
        email: `contact-${i + 1}@demo.example`, tempScore: 35, temperature: "warm", whyNow: "Fictional offline demo fixture.", status: "drafted" }).onConflictDoNothing();
      await tx.insert(leadSignals).values({ agencyId: agency.id, leadId, signalId: `40000000-0000-4000-8000-${suffix}` }).onConflictDoNothing();
      for (let variant = 1; variant <= 3; variant++) {
        await tx.insert(drafts).values({ id: `60000000-0000-4000-8000-${String(i * 3 + variant).padStart(12, "0")}`,
          agencyId: agency.id, leadId, variant, subject: `[Demo] A conversation about growth — option ${variant}`,
          body: "This is a fictional draft fixture for later phases. It has not been generated by AI or approved for sending.",
          language: "en", status: "generated" }).onConflictDoNothing();
      }
    }
  });
  logger.info("Foundation seed complete: one agency, two demo clients, twelve definitions, ten demo signals. No emails sent.");
}

seed().then(() => pool.end()).catch(() => {
  logger.error("Seed failed. Check the database schema.");
  void pool.end().then(() => process.exit(1));
});
