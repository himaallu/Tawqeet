import { and, eq, asc } from "drizzle-orm";
import { db, clients, companies, leads, caseStudies, drafts } from "@workspace/db";
import sources from "./sources.json" with { type: "json" };
import { addEvidence } from "./hiring";
import { leadEvidence } from "../signals/scoring";
import { writeDrafts, simulate, refreshGeminiSummaries } from "./writer";
import { notifyHotLeads } from "../alerts";

const fixtures = [
  { name: "Autobia", country: "SA", vertical: "saas", domain: "autobia.sa", fit: 35, source: 0, keys: ["funding_round"], jobs: [1,2] },
  { name: "Foodics", country: "SA", vertical: "saas", domain: "foodics.com", fit: 35, source: 3, keys: ["partnership_announced"], jobs: [4] },
  { name: "Ziina", country: "AE", vertical: "saas", domain: "ziina.com", fit: 5, source: 5, keys: ["regulation_change"], jobs: [] },
  { name: "Tabby", country: "AE", vertical: "saas", domain: "tabby.ai", fit: 5, source: -1, keys: [], jobs: [] },
  { name: "JustAd", country: "AE", vertical: "saas", domain: "justad.ai", fit: 10, source: 10, keys: ["funding_round","expansion_new_market"], jobs: [] },
  { name: "Ghanem", country: "SA", vertical: "re", domain: "ghanem.sa", fit: 20, source: 11, keys: ["funding_round"], jobs: [] },
  { name: "Vrtx", country: "SA", vertical: "saas", domain: "vrtx.sa", fit: 0, source: 12, keys: ["funding_round"], jobs: [] },
  { name: "Dubai Holding", country: "AE", vertical: "re", domain: "dubaiholding.com", fit: 0, source: 13, keys: ["project_award_or_launch"], jobs: [] },
];
const sampleNames = [["Omar Saleh","Noura Khalid"],["Faisal Ahmed","Sara Hassan"],["Khalid Mansour","Lina Omar"],["Rashid Ali","Mariam Saeed"],
  ["Ahmed Nasser","Hana Faris"],["عمر السالم","نورة العلي"],["Yousef Hamad","Reem Khalid"],["Saeed Ahmed","Dana Ali"]];
async function contacts(company: typeof companies.$inferSelect): Promise<{name:string;title:string;linkedin?:string}[]> {
  if (!process.env.LEADOCEAN_API_KEY) return [];
  const domains=company.name==="Autobia"?["autobia.sa","autobia.com"]:company.name==="JustAd"?["justad.ai","just.ad"]:company.domain?[company.domain]:[];
  const r = await fetch("https://api.leadocean.io/v1/people/search", { method:"POST", signal:AbortSignal.timeout(15000),
    headers:{"content-type":"application/json","x-api-key":process.env.LEADOCEAN_API_KEY},
    body:JSON.stringify({ ...(domains.length?{domain:domains}:{q:company.name}),
      title:["CEO","chief executive","sales","growth"],limit:10 }) });
  if (!r.ok) throw new Error(`LeadOcean HTTP ${r.status}`);
  const payload = await r.json() as any;
  const rows = payload.people || payload.data?.people || payload.data || payload.results || [];
  if (!Array.isArray(rows)) return [];
  const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
  return rows.map((p:any)=>{
    const experience=(p.contact_data?.contact_current_experiences||[]).find((e:any)=>e.current!==false &&
      (domains.length ? domains.includes(String(e.company_domain||"").replace(/^www\./,"").toLowerCase())
        : normalize(String(e.company_name||"")).includes(normalize(company.name))));
    return {name:p.profile_data?.profile_full_name,title:experience?.job_title,
      linkedin:p.profile_data?.profile_url};
  }).filter(p=>typeof p.name==="string" && typeof p.title==="string"
      && /sales|growth|chief executive|CEO|business development/i.test(p.title)).slice(0,2);
}
export async function seedDemo(agencyId:string, stage:(s:string)=>void, warn:(s:string)=>void) {
  const [client] = await db.select().from(clients).where(eq(clients.agencyId,agencyId)).orderBy(asc(clients.createdAt)).limit(1);
  if (!client) throw new Error("Create a client and its Brain before loading this demo.");
  stage("Using existing client and Brain");
  const approved = await db.select().from(caseStudies).where(and(eq(caseStudies.clientId,client.id),eq(caseStudies.approved,true)));
  for(let n=approved.length;n<2;n++) await db.insert(caseStudies).values({
    agencyId,clientId:client.id,title:`Illustrative demo workflow ${n+1}`,customerName:`DEMO SAMPLE — ${n ? "property" : "software"} workflow`,
    customerVertical:n?"re":"saas",customerCountry:"AE",problem:"Illustrative demo scenario, not a verified customer case.",
    solution:"Illustrative workflow: understand the buying signal, use approved context, and ask a relevant question.",
    resultMetric:"No verified outcome claimed",resultValue:"",approved:true,canNameCustomer:false,
    source:"form",sourceRef:`demo:illustrative:${n}`,language:"en",
  });
  const seeded: string[] = [];
  const refresh = new Set<string>();
  warn("Demo fit points are illustrative inputs, not verified ICP enrichment. Approved emails go only to the demo recipient.");
  warn("Two supplied Marketing Monk links return404. Verified MEVP and Naukrigulf alternatives are used instead.");
  for (let i=0;i<fixtures.length;i++) {
    const f=fixtures[i]!;
    stage(`Loading evidence and contacts: ${f.name}`);
    let [company]=await db.select().from(companies).where(and(eq(companies.agencyId,agencyId),eq(companies.name,f.name)));
    if(!company) [company]=await db.insert(companies).values({agencyId,name:f.name,domain:f.domain,country:f.country,vertical:f.vertical}).returning();
    const c={...company!,domain:f.domain};
    await db.update(companies).set({domain:f.domain,radarMeta:{...c.radarMeta,tracked:true,demo:true}}).where(eq(companies.id,c.id));
    const source=sources[f.source];
    if(source?.available && source.quote) for(const key of f.keys) {
      // Wamda gives month precision in these URLs; latest day in that month is a conservative scoring bound.
      const date=source.date?new Date(source.date):new Date("2026-10-31T00:00:00Z");
      await addEvidence(c,key,source.title.replace(/ - Wamda$/,""),source.quote,source.url,date,
        {demo:true,verified_source:true,date_precision:source.date?"day":"month",company_specific_licence:key==="regulation_change"});
    }
    for(const index of f.jobs) {
      const s=sources[index]!;
      if(s.available && s.quote) await addEvidence(c,"hiring_sales_role",s.quote,s.quote,s.url,new Date(),{demo:true,verified_source:true,observed_open_at:s.checkedAt});
    }
    if(f.name==="Ziina") await addEvidence(c,"hiring_sales_role","CRM & Lifecycle Specialist",
      "Own the lifecycle metrics: set targets for activation, retention and conversion",
      "https://jobs.mevp.com/companies/ziina/jobs/97398626-crm-lifecycle-specialist",new Date(),{demo:true,verified_source:true});
    if(f.name==="Tabby") await addEvidence(c,"hiring_sales_role","Business Development Executive","Business Development Executive",
      "https://www.naukrigulf.com/business-development-executive-jobs-in-saudi-arabia-in-tabby-1-to-2-years-n-cd-10008872-jid-140926500955",
      new Date(),{demo:true,verified_source:true,observed_open_at:new Date().toISOString()});
    let found: Awaited<ReturnType<typeof contacts>>=[];
    try { found=await contacts(c); } catch(e) { warn(`${f.name}: ${e instanceof Error && /^LeadOcean HTTP \d+$/.test(e.message)?e.message:"LeadOcean unavailable"}; sample contacts used.`); }
    if(found.length<2) warn(`${f.name}: ${2-found.length} clearly labeled sample contacts (LeadOcean missing or no matching results).`);
    for(let k=0;k<2;k++) {
      const real=found[k]; const demoKey=`hackathon:${f.name}:${k}`;
      const [existing]=await db.select().from(leads).where(and(eq(leads.agencyId,agencyId),eq(leads.demoKey,demoKey)));
      if(existing){
        const name=real?.name||sampleNames[i]![k]!;
        const title=real?.title||(k?"Head of Growth":"CEO");
        if(existing.fullName!==name || existing.title!==title || existing.sample!==!real) {
          await db.update(leads).set({fullName:name,title,linkedinUrl:real?.linkedin||null,sample:!real}).where(eq(leads.id,existing.id));
          refresh.add(existing.id);
        }
        seeded.push(existing.id);continue;
      }
      const [lead]=await db.insert(leads).values({agencyId,clientId:client.id,companyId:c.id,demoKey,
        fullName:real?.name || sampleNames[i]![k]!,title:real?.title || (k?"Head of Growth":"CEO"),
        linkedinUrl:real?.linkedin || null,sample:!real,email:null,emailVerified:false,fitScore:f.fit,
        language:f.name==="Ghanem"?"ar":"en",whyNow:"Source-backed demo scenario; fit points are illustrative."}).returning();
      seeded.push(lead!.id);
    }
  }
  await leadEvidence(agencyId,db,true);
  stage("Sending Hot lead alerts");
  await notifyHotLeads(agencyId,warn);
  // Two concurrent leads, with cached drafts left intact on repeat Load clicks.
  for(let index=0;index<seeded.length;index+=2) await Promise.all(seeded.slice(index,index+2).map(async id=>{
    const [lead]=await db.select().from(leads).where(eq(leads.id,id));
    const existing=await db.select().from(drafts).where(eq(drafts.leadId,id));
    stage(`Writing and simulating: ${lead!.fullName}`);
    try {
      if(existing.length<3 || refresh.has(id)) await writeDrafts(agencyId,id,true,true);
      else for(const d of existing) if(!(d.sim as any)?.simulation) await simulate(agencyId,d.id);
    } catch { warn(`${lead!.fullName}: AI generation failed. Use Regenerate drafts to retry.`); }
  }));
  if(process.env.GEMINI_API_KEY) {
    stage("Refreshing Gmail-style summaries with Gemini");
    try { await refreshGeminiSummaries(agencyId); } catch(e) {
      const err=e as {name?:string;statusCode?:number};
      warn(`Gemini refresh failed (${err.name||"error"}, HTTP ${err.statusCode||"unknown"}); existing model labels retained.`);
    }
  }
  stage("Demo ready — Radar → Lead → Drafts → Simulated inbox");
}
