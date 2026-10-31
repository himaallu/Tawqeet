import { Router } from "express";
import { and, eq, isNotNull, asc } from "drizzle-orm";
import { z } from "zod";
import { db, agencies, users, sessions, companies, leads, drafts } from "@workspace/db";
import { COOKIE_NAME, randomToken, hashToken, requireUser, requireAgencyStaff } from "../lib/security";
import { appOrigin } from "../lib/config";
import { leadEvidence } from "../lib/signals/scoring";
import { hiringRadar, manualSignal } from "../lib/demo/hiring";
import { seedDemo } from "../lib/demo/seed";
import { notifyHotLeads } from "../lib/alerts";
import { simulationLimitReached } from "../lib/plan";
import { writeDrafts, simulate, rewrite, refreshGeminiSummaries } from "../lib/demo/writer";

const router = Router();
const job = { running:false, stage:"Ready", warnings:[] as string[], error:null as string|null };
const stage=(s:string)=>{job.stage=s;};
const warn=(s:string)=>{if(!job.warnings.includes(s)) job.warnings.push(s);};
function start(work:()=>Promise<void>) {
  if(job.running) return false;
  job.running=true; job.error=null; job.warnings=[]; job.stage="Starting";
  void work().then(()=>{if(!job.stage.startsWith("Demo ready")) job.stage="Complete";})
    .catch(e=>{job.error=e instanceof Error?e.message.slice(0,250):"Operation failed. Please retry.";job.stage="Needs attention";})
    .finally(()=>{job.running=false;});
  return true;
}
router.get("/demo/status",async(_req,res)=>{
  const enabled=process.env.DEMO_MODE==="true";
  if(!enabled){res.json({enabled:false,loaded:false,running:false,stage:"Disabled",warnings:[],error:null,geminiConfigured:false});return;}
  const seeded=await db.select({id:leads.id}).from(leads).where(isNotNull(leads.demoKey));
  res.json({enabled,loaded:seeded.length>=16,...job,geminiConfigured:Boolean(process.env.GEMINI_API_KEY)});
});
router.use("/demo",(_req,res,next)=>{
  if(process.env.DEMO_MODE!=="true"){res.status(404).json({error:"Demo mode is disabled."});return;}next();
});
router.post("/demo/login",async(_req,res)=>{
  const [agency]=await db.select().from(agencies).limit(1);
  if(!agency){res.status(409).json({error:"Agency setup required."});return;}
  let [user]=await db.select().from(users).where(eq(users.email,"demo@tawqeet.invalid"));
  if(!user) [user]=await db.insert(users).values({agencyId:agency.id,email:"demo@tawqeet.invalid",role:"member"})
    .onConflictDoUpdate({target:users.email,set:{role:"member"}}).returning();
  const token=randomToken(),expiresAt=new Date(Date.now()+4*60*60*1000);
  await db.insert(sessions).values({tokenHash:hashToken(token),userId:user!.id,agencyId:agency.id,expiresAt});
  res.cookie(COOKIE_NAME,token,{httpOnly:true,secure:appOrigin().startsWith("https:"),sameSite:"lax",path:"/",expires:expiresAt});
  res.json({message:"Demo session created. Emails go only to the demo recipient."});
});
router.use("/demo",requireUser,requireAgencyStaff);

async function radar(agencyId:string) {
  const [people,orgs,emails,evidence]=await Promise.all([
    db.select().from(leads).where(and(eq(leads.agencyId,agencyId),isNotNull(leads.demoKey))),
    db.select().from(companies).where(eq(companies.agencyId,agencyId)),
    db.select().from(drafts).where(eq(drafts.agencyId,agencyId)).orderBy(asc(drafts.variant)),
    leadEvidence(agencyId,db,true),
  ]);
  return {leads:people.map(p=>{
    const c=orgs.find(c=>c.id===p.companyId)!;const e=evidence.find(e=>e.id===p.id)!;
    return {id:p.id,fullName:p.fullName,title:p.title||"",companyName:c.name,country:c.country||"",clientId:p.clientId,
      temperature:e.totalScore>=70?"hot":e.totalScore>=35?"warm":"cold",totalScore:e.totalScore,signalPoints:e.signalPoints,
      stackingBonus:e.stackingBonus,sample:p.sample,language:p.language,legalBasis:p.legalBasis,signals:e.signals,
      drafts:emails.filter(d=>d.leadId===p.id).map(d=>({id:d.id,variant:d.variant,subject:d.subject,body:d.body,language:d.language,
        score:d.score,simulation:(d.sim as any)?.simulation||null,model:(d.sim as any)?.model||"Not recorded"}))};
  }),companies:orgs.filter(c=>c.radarMeta.tracked).map(c=>({id:c.id,name:c.name,country:c.country||"",
    atsProvider:c.radarMeta.atsProvider||null,atsSlug:c.radarMeta.atsSlug||null,roleCount:c.radarMeta.roleCount||0,
    lastCheckedAt:c.radarMeta.lastCheckedAt||null,error:c.radarMeta.error||null}))};
}
router.get("/demo/radar",async(req,res)=>{res.json(await radar(req.user!.agencyId));});
router.get("/demo/leads/:id",async(req,res)=>{
  const result=(await radar(req.user!.agencyId)).leads.find(l=>l.id===req.params.id);
  if(!result){res.status(404).json({error:"Lead not found"});return;}res.json(result);
});
router.post("/demo/load",(req,res)=>{
  const started=start(async()=>{
    if(req.body?.summariesOnly===true) {
      stage("Refreshing Gemini summaries with rate-limit pacing");
      try {await refreshGeminiSummaries(req.user!.agencyId);}
      catch(e) {
        const error=e as {statusCode?:number;lastError?:{statusCode?:number};message?:string};
        const code=error.statusCode||error.lastError?.statusCode;
        const reason=/quota|rate.limit|resource.exhausted/i.test(error.message||"")?"rate or quota limit":"provider error";
        throw new Error(`Gemini ${reason} (HTTP ${code||"unknown"}). Existing summaries are retained.`);
      }
    } else await seedDemo(req.user!.agencyId,stage,warn);
  });
  res.status(started?202:409).json(started?{message:"Demo loading started"}:{error:"Another demo job is running."});
});
router.post("/demo/radar/run",(req,res)=>{
  const started=start(async()=>{await hiringRadar(req.user!.agencyId,stage,warn);await notifyHotLeads(req.user!.agencyId,warn);});
  res.status(started?202:409).json(started?{message:"Radar started"}:{error:"Another demo job is running."});
});
router.post("/demo/signals",(req,res)=>{
  const parsed=z.object({companyId:z.string().uuid(),url:z.string().url()}).safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:"Choose a company and provide a public URL."});return;}
  const started=start(async()=>{stage("AI is reading the source");await manualSignal(req.user!.agencyId,parsed.data.companyId,parsed.data.url);await notifyHotLeads(req.user!.agencyId,warn);});
  res.status(started?202:409).json(started?{message:"Reading source"}:{error:"Another demo job is running."});
});
router.post("/demo/leads/:id/drafts",async(req,res)=>{
  const [lead]=await db.select().from(leads).where(and(eq(leads.agencyId,req.user!.agencyId),eq(leads.id,String(req.params.id)),isNotNull(leads.demoKey)));
  if(!lead){res.status(404).json({error:"Demo lead not found"});return;}
  const limit=await simulationLimitReached(req.user!.agencyId,3);
  if(limit){res.status(402).json({error:limit,upgrade:true});return;}
  const started=start(async()=>{stage(`Writing ${lead.fullName}'s drafts`);await writeDrafts(req.user!.agencyId,lead.id,true);});
  res.status(started?202:409).json(started?{message:"Writing drafts"}:{error:"Another demo job is running."});
});
for(const action of ["simulate","rewrite"] as const) router.post(`/demo/drafts/:id/${action}`,async(req,res)=>{
  const [draft]=await db.select({id:drafts.id}).from(drafts).innerJoin(leads,eq(leads.id,drafts.leadId))
    .where(and(eq(drafts.agencyId,req.user!.agencyId),eq(drafts.id,String(req.params.id)),isNotNull(leads.demoKey)));
  if(!draft){res.status(404).json({error:"Demo draft not found"});return;}
  const limit=await simulationLimitReached(req.user!.agencyId);
  if(limit){res.status(402).json({error:limit,upgrade:true});return;}
  const started=start(async()=>{stage(action==="rewrite"?"Rewriting and re-scoring":"Simulating six recipients");await (action==="rewrite"?rewrite:simulate)(req.user!.agencyId,draft.id);});
  res.status(started?202:409).json(started?{message:"Started"}:{error:"Another demo job is running."});
});
export default router;
