import { db } from "../db";
import { brainEntries } from "../db/schema";
import { http } from "../lib/http";
import { signState, type OAuthState } from "./mailboxes";

/**
 * CRM connect: HubSpot OAuth → import won deals and their industries as brain_entries(kind=crm).
 * Without HUBSPOT_CLIENT_ID/SECRET the UI shows "coming soon".
 */
const SCOPES = ["crm.objects.deals.read", "crm.objects.companies.read", "oauth"];
const redirectUri = () => `${(process.env.APP_URL ?? "http://localhost:5000").replace(/\/$/, "")}/api/oauth/hubspot/callback`;

export const hubspotConfigured = () => Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);

export function hubspotAuthorizeUrl(s: Omit<OAuthState, "exp" | "n">) {
  const q = new URLSearchParams({ client_id: process.env.HUBSPOT_CLIENT_ID!, redirect_uri: redirectUri(), scope: SCOPES.join(" "), state: signState(s) });
  return `https://app.hubspot.com/oauth/authorize?${q}`;
}

type Deal = { id: string; properties: { dealname?: string; amount?: string; closedate?: string } };

export async function importWonDeals(state: OAuthState, code: string) {
  const tokenRes = await http("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      code,
    }),
  });
  if (!tokenRes.ok) throw new Error(`HubSpot token ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const auth = { authorization: `Bearer ${access_token}`, "content-type": "application/json" };

  const search = await http("https://api.hubapi.com/crm/v3/objects/deals/search", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "dealstage", operator: "EQ", value: "closedwon" }] }],
      properties: ["dealname", "amount", "closedate"],
      limit: 100,
    }),
  });
  if (!search.ok) throw new Error(`HubSpot deals ${search.status}`);
  const deals = ((await search.json()) as { results: Deal[] }).results;

  let imported = 0;
  for (const d of deals) {
    let industry: string | null = null;
    let company: string | null = null;
    const assoc = await http(`https://api.hubapi.com/crm/v4/objects/deals/${d.id}/associations/companies`, { headers: auth });
    if (assoc.ok) {
      const companyId = ((await assoc.json()) as { results: { toObjectId: number }[] }).results[0]?.toObjectId;
      if (companyId) {
        const c = await http(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=name,industry,country`, { headers: auth });
        if (c.ok) {
          const props = ((await c.json()) as { properties: { name?: string; industry?: string } }).properties;
          industry = props.industry ?? null;
          company = props.name ?? null;
        }
      }
    }
    await db.insert(brainEntries).values({
      agencyId: state.agencyId,
      clientId: state.clientId,
      kind: "crm",
      content: `Won: ${d.properties.dealname ?? "deal"}${company ? ` (${company})` : ""}${industry ? ` · ${industry}` : ""}`,
      meta: { source: "hubspot", dealId: d.id, amount: d.properties.amount, closedate: d.properties.closedate, industry, company },
    });
    imported++;
  }
  return imported;
}
