import { createHash } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { parse } from "csv-parse/sync";
import { BrainError } from "./errors";

const connectors = new ReplitConnectors();
let connectionCheck: { expires: number; configured: boolean } | undefined;
export async function hubspotConfigured() {
  if (process.env.HUBSPOT_TOKEN) return true;
  if (connectionCheck && connectionCheck.expires > Date.now()) return connectionCheck.configured;
  try {
    const connections = await Promise.race([
      connectors.listConnections({ connector_names: "hubspot" }),
      new Promise<never>((_resolve, reject) => { const timer = setTimeout(() => reject(new Error("HubSpot check timed out.")), 5000); timer.unref(); }),
    ]);
    const configured = connections.some(c => c.connector_name === "hubspot" || c.connector?.name === "hubspot");
    connectionCheck = { expires: Date.now() + 30000, configured };
    return configured;
  } catch { return false; }
}
type CrmRecord = { externalId: string; type: "contact" | "company" | "won_deal"; data: Record<string, string>; industry: string };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function parseCrmCsv(csv: string, kind: "contacts" | "won_deals") {
  let rows: Record<string, string>[];
  try {
    rows = parse(csv, {
      bom: true, columns: (headers: string[]) => {
        const normalized = headers.map(h => h.trim().toLowerCase().replace(/[ -]+/g, "_"));
        if (new Set(normalized).size !== normalized.length) throw new Error("Duplicate headers.");
        return normalized;
      },
      skip_empty_lines: true, trim: true, max_record_size: 20000,
    });
  } catch { throw new BrainError(400, "Invalid CSV. Include a unique header row and quote values containing commas."); }
  if (!rows.length || rows.length > 2000) throw new BrainError(400, "Upload a CSV containing 1–2,000 rows.");
  const records: CrmRecord[] = [];
  let skipped = 0;
  for (const row of rows) {
    const data: Record<string, string> = {};
    const fields = ["email", "firstname", "lastname", "first_name", "last_name", "company", "industry", "vertical", "dealname", "deal_name", "amount", "dealstage", "deal_stage", "stage", "status", "closedate", "country", "domain"];
    for (const field of fields) if (row[field]) data[field] = row[field]!.slice(0, 2000);
    const stage = (row.dealstage || row.deal_stage || row.stage || row.status || "").toLowerCase().replace(/[\s_-]/g, "");
    if (kind === "won_deals" && stage && !["closedwon", "won"].includes(stage)) { skipped++; continue; }
    const identity = kind === "contacts" ? row.email || row.id || row.record_id : row.id || row.record_id || row.dealname || row.deal_name;
    if (!identity || (kind === "contacts" && row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) { skipped++; continue; }
    records.push({
      externalId: `csv:${kind}:${digest(identity.trim().toLowerCase())}`,
      type: kind === "contacts" ? "contact" : "won_deal",
      data, industry: row.industry || row.vertical || "",
    });
  }
  return { records, skipped };
}

async function hubspotRequest(path: string, body?: unknown): Promise<Record<string, any>> {
  const init = {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = process.env.HUBSPOT_TOKEN
      ? await fetch(`https://api.hubapi.com${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` }, signal: AbortSignal.timeout(20000) })
      : await connectors.proxy("hubspot", path, init);
    if (response.status === 429 || response.status >= 500) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, (attempt + 1) * 1500)); continue; }
    }
    if (!response.ok) throw new BrainError(response.status === 401 || response.status === 403 ? 503 : 502,
      response.status === 401 || response.status === 403
        ? "HubSpot access was rejected. Reconnect HubSpot or configure HUBSPOT_TOKEN with companies and deals read permissions."
        : `HubSpot import failed (HTTP ${response.status}). No records were saved.`);
    return response.json() as Promise<Record<string, any>>;
  }
  throw new BrainError(502, "HubSpot is rate-limiting requests. Please retry shortly.");
}
export async function readHubspot() {
  if (!await hubspotConfigured()) throw new BrainError(503, "Connect HubSpot or add the HUBSPOT_TOKEN secret to enable import.");
  const records: CrmRecord[] = [];
  const companies = new Map<string, Record<string, string>>();
  const warnings: string[] = [];
  let after: string | undefined;
  do {
    const result = await hubspotRequest(`/crm/v3/objects/companies?limit=100&properties=name,industry,country,domain,numberofemployees&archived=false${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    for (const company of result.results || []) {
      companies.set(String(company.id), company.properties || {});
      records.push({ externalId: `hubspot:company:${company.id}`, type: "company", data: company.properties || {}, industry: company.properties?.industry || "" });
    }
    after = result.paging?.next?.after;
  } while (after && companies.size < 2000);
  if (after) warnings.push("Company import limited to 2,000 records.");
  // Discover won stage IDs from every pipeline, rather than assuming 'closedwon'.
  const pipelines = await hubspotRequest("/crm/v3/pipelines/deals");
  const wonStages: string[] = (pipelines.results || []).flatMap((p: any) => (p.stages || [])
    .filter((s: any) => String(s.metadata?.isClosed) === "true" && Number(s.metadata?.probability) === 1)
    .map((s: any) => s.id));
  if (!wonStages.length) { warnings.push("No closed-won deal stages were found."); return { records, warnings }; }
  // The search API caps values per IN filter; normal CRMs have only a few won stages.
  if (wonStages.length > 100) throw new BrainError(422, "Too many won stages for a lite import. Use a won-deals CSV.");
  let dealCount = 0;
  after = undefined;
  do {
    const result = await hubspotRequest("/crm/v3/objects/deals/search", {
      filterGroups: [{ filters: [{ propertyName: "dealstage", operator: "IN", values: wonStages }] }],
      properties: ["dealname", "amount", "dealstage", "closedate"],
      limit: 100, ...(after ? { after } : {}),
    });
    const deals = result.results || [];
    // Batch associations connect each won deal to the actual company industry.
    const associations = deals.length ? await hubspotRequest("/crm/v4/associations/deals/companies/batch/read", {
      inputs: deals.map((d: any) => ({ id: String(d.id) })),
    }) : { results: [] };
    const dealCompanies = new Map<string, string>();
    for (const association of associations.results || []) {
      const primary = association.to?.find((t: any) => t.associationTypes?.some((a: any) => a.typeId === 5)) || association.to?.[0];
      if (primary) dealCompanies.set(String(association.from.id), String(primary.toObjectId));
    }
    const missing = [...new Set([...dealCompanies.values()].filter(id => !companies.has(id)))];
    if (missing.length) {
      const linked = await hubspotRequest("/crm/v3/objects/companies/batch/read", {
        inputs: missing.map(id => ({ id })), properties: ["name", "industry", "country", "domain", "numberofemployees"],
      });
      for (const company of linked.results || []) companies.set(String(company.id), company.properties || {});
    }
    for (const deal of deals) {
      const company = companies.get(dealCompanies.get(String(deal.id)) || "");
      records.push({
        externalId: `hubspot:deal:${deal.id}`, type: "won_deal",
        data: { ...deal.properties, company: company?.name || "", industry: company?.industry || "" },
        industry: company?.industry || "",
      });
    }
    dealCount += deals.length;
    after = result.paging?.next?.after;
    // HubSpot search limit is 5/sec.
    if (after) await new Promise(r => setTimeout(r, 250));
  } while (after && dealCount < 2000);
  if (after) warnings.push("Closed-won deal import limited to 2,000 records.");
  return { records, warnings };
}

export type { CrmRecord };
