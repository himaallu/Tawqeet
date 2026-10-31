import { Router, type IRouter, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { and, eq, sql } from "drizzle-orm";
import { db, clients, brainEntries, caseStudies, brainUploads } from "@workspace/db";
import {
  SaveBrainProfileBody, CrawlBrainWebsiteBody, CreateBrainCaseStudyBody, UpdateBrainCaseStudyBody,
  ExtractBrainCaseStudiesBody, RequestBrainUploadBody, ImportBrainCsvBody, GetBrainParams,
} from "@workspace/api-zod";
import { requireUser, requireAgencyStaff } from "../lib/security";
import { BrainError } from "../lib/brain/errors";
import { brainResponse, getLearnings, saveCrmRecords, serializeCase, serializeEntry } from "../lib/brain/profile";
import { crawlWebsite, fetchPublicHtml, readableHtml } from "../lib/brain/crawl";
import { extractKnowledge, requireExtraction } from "../lib/brain/extract";
import { fileTypes, signUpload, extractUploadText } from "../lib/brain/storage";
import { parseCrmCsv, readHubspot } from "../lib/brain/crm";

const router: IRouter = Router();
const base = "/clients/:id/brain";
router.use(base, requireUser, requireAgencyStaff, (async (req, res, next) => {
  const parsed = GetBrainParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid client ID." }); return; }
  const [client] = await db.select().from(clients).where(and(eq(clients.id, parsed.data.id), eq(clients.agencyId, req.user!.agencyId))).limit(1);
  if (!client) { res.status(404).json({ error: "Client not found." }); return; }
  res.locals.brainClient = client;
  next();
}) as RequestHandler);
const limited = rateLimit({
  windowMs: 5 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: req => req.user!.id,
  message: { error: "Too many Brain imports. Wait a few minutes and retry." },
});
// An import is an explicit human action. No crawling or CRM access occurs on page load.
router.get(base, async (_req, res) => { res.json(await brainResponse(res.locals.brainClient)); });
router.patch(base, async (req, res) => {
  const parsed = SaveBrainProfileBody.safeParse(req.body);
  if (!parsed.success) throw new BrainError(400, "Check the profile fields. Choose EN or AR and enter at most three pains.");
  const input = parsed.data;
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  const saved = await db.transaction(async tx => {
    const [locked] = await tx.select().from(clients).where(and(eq(clients.id, client.id), eq(clients.agencyId, client.agencyId))).for("update");
    if (!locked) throw new BrainError(404, "Client not found.");
    const [updated] = await tx.update(clients).set({
      offer: input.offer, tone: input.tone, noGoClaims: input.noGoClaims, languages: [...new Set(input.languages)],
      proofPoints: input.proofPoints, differentiators: input.differentiators,
      icp: { ...locked.icp, whoYouSellTo: input.whoYouSellTo, dealSize: input.dealSize, topPains: input.topPains, wordsToNeverUse: input.wordsToNeverUse },
    }).where(and(eq(clients.id, client.id), eq(clients.agencyId, client.agencyId))).returning();
    await tx.insert(brainEntries).values({ agencyId: client.agencyId, clientId: client.id, kind: "form", content: JSON.stringify(input), meta: { source: "onboarding", saved_by: req.user!.id } });
    return updated!;
  });
  res.json(await brainResponse(saved));
});
router.post(`${base}/crawl`, limited, async (req, res) => {
  const parsed = CrawlBrainWebsiteBody.safeParse(req.body);
  if (!parsed.success) throw new BrainError(400, "Enter a valid website URL.");
  requireExtraction();
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  const crawl = await crawlWebsite(parsed.data.url);
  const extraction = await extractKnowledge(client.agencyId, client.id, crawl.pages.map(p => `URL: ${p.url}\n${p.text}`).join("\n\n"), true);
  const cases = extraction.case_studies.filter(c => c.problem.trim() && c.solution.trim());
  await db.transaction(async tx => {
    const [locked] = await tx.select().from(clients).where(and(eq(clients.id, client.id), eq(clients.agencyId, client.agencyId))).for("update");
    if (!locked) throw new BrainError(404, "Client not found.");
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].slice(0, 100);
    await tx.update(clients).set({
      website: parsed.data.url, offer: extraction.offer || locked.offer, tone: extraction.tone || locked.tone,
      icp: extraction.icp ? { ...locked.icp, whoYouSellTo: extraction.icp } : locked.icp,
      proofPoints: union(locked.proofPoints, extraction.proof_points),
      differentiators: union(locked.differentiators, extraction.differentiators),
      noGoClaims: union(locked.noGoClaims, extraction.no_go_claims),
    }).where(and(eq(clients.id, client.id), eq(clients.agencyId, client.agencyId)));
    await tx.insert(brainEntries).values({
      agencyId: client.agencyId, clientId: client.id, kind: "website", content: JSON.stringify(extraction),
      meta: { url: parsed.data.url, pages: crawl.pages.map(p => p.url), warnings: crawl.warnings },
    });
    const previous = await tx.select().from(caseStudies).where(and(eq(caseStudies.agencyId, client.agencyId), eq(caseStudies.clientId, client.id)));
    for (const study of cases) {
      if (previous.some(p => p.source === "website" && p.customerName === study.customerName && p.problem === study.problem)) continue;
      await tx.insert(caseStudies).values({
        ...study, agencyId: client.agencyId, clientId: client.id, title: study.customerName || "Website case study",
        source: "website", sourceRef: parsed.data.url, canNameCustomer: false, approved: false,
      });
    }
  });
  res.json({ message: `Read ${crawl.pages.length} pages. Profile updated; extracted case studies need approval.`, imported: crawl.pages.length, skipped: crawl.warnings.length, warnings: crawl.warnings });
});
router.post(`${base}/case-studies`, async (req, res) => {
  const parsed = CreateBrainCaseStudyBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.problem.trim() || !parsed.data.solution.trim()) throw new BrainError(400, "Enter a problem, solution and valid case-study fields.");
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  const [row] = await db.insert(caseStudies).values({
    ...parsed.data, agencyId: client.agencyId, clientId: client.id, source: "form",
    title: parsed.data.customerName || "Anonymous customer",
  }).returning();
  res.status(201).json(serializeCase(row!));
});
router.patch(`${base}/case-studies/:caseId`, async (req, res) => {
  const parsed = UpdateBrainCaseStudyBody.safeParse(req.body);
  const caseId = String(req.params.caseId);
  if (!/^[a-f0-9-]{36}$/i.test(caseId) || !parsed.success || !parsed.data.problem.trim() || !parsed.data.solution.trim()) throw new BrainError(400, "Enter a valid case study with a problem and solution.");
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  const [row] = await db.update(caseStudies).set({
    ...parsed.data, title: parsed.data.customerName || "Anonymous customer",
  }).where(and(eq(caseStudies.id, caseId), eq(caseStudies.clientId, client.id), eq(caseStudies.agencyId, client.agencyId))).returning();
  if (!row) throw new BrainError(404, "Case study not found.");
  res.json(serializeCase(row));
});
router.post(`${base}/uploads`, limited, async (req, res) => {
  const parsed = RequestBrainUploadBody.safeParse(req.body);
  if (!parsed.success) throw new BrainError(400, "Upload a PDF, DOCX, or PPTX of at most 10 MB.");
  const input = parsed.data;
  const ext = input.name.split(".").pop()?.toLowerCase() || "";
  if (!fileTypes[ext] || (input.contentType && input.contentType !== fileTypes[ext] && input.contentType !== "application/octet-stream")) throw new BrainError(400, "Supported files: PDF, DOCX, PPTX.");
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  const signed = await signUpload();
  await db.insert(brainUploads).values({
    agencyId: client.agencyId, clientId: client.id, objectPath: signed.objectPath,
    name: input.name, contentType: fileTypes[ext]!, size: input.size,
  });
  res.json(signed);
});
router.post(`${base}/case-studies/extract`, limited, async (req, res) => {
  const parsed = ExtractBrainCaseStudiesBody.safeParse(req.body);
  if (!parsed.success || Boolean(parsed.data.url) === Boolean(parsed.data.objectPath)) throw new BrainError(400, "Provide either one URL or one uploaded file.");
  requireExtraction();
  const input = parsed.data;
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  let text: string;
  if (input.objectPath) {
    const [upload] = await db.select().from(brainUploads).where(and(eq(brainUploads.objectPath, input.objectPath), eq(brainUploads.agencyId, client.agencyId), eq(brainUploads.clientId, client.id))).limit(1);
    if (!upload) throw new BrainError(404, "Upload not found for this client.");
    try { text = await extractUploadText(upload); }
    catch (error) { if (error instanceof BrainError) throw error; throw new BrainError(422, "The document could not be read. Try an unencrypted PDF, DOCX, or PPTX."); }
  } else {
    const page = await fetchPublicHtml(input.url!);
    text = `URL: ${page.url}\n${readableHtml(page.html)}`;
  }
  const extracted = await extractKnowledge(client.agencyId, client.id, text, false);
  const studies = extracted.case_studies.filter(s => s.problem.trim() && s.solution.trim());
  if (!studies.length) throw new BrainError(422, "No evidence-backed case studies were found. Use the short form to add one.");
  const imported = await db.transaction(async tx => {
    await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, client.id), eq(clients.agencyId, client.agencyId))).for("update");
    const previous = await tx.select().from(caseStudies).where(and(eq(caseStudies.agencyId, client.agencyId), eq(caseStudies.clientId, client.id)));
    let count = 0;
    for (const study of studies) {
      if (previous.some(p => p.customerName === study.customerName && p.problem === study.problem && p.sourceRef === (input.url || input.objectPath))) continue;
      await tx.insert(caseStudies).values({
        ...study, agencyId: client.agencyId, clientId: client.id, title: study.customerName || "Extracted case study",
        source: input.url ? "url" : "upload", sourceRef: input.url || input.objectPath,
        approved: false, canNameCustomer: false,
      });
      count++;
    }
    return count;
  });
  res.json({ message: `${imported} case studies saved for human review.`, imported, skipped: studies.length - imported, warnings: [] });
});
router.post(`${base}/crm/csv`, limited, async (req, res) => {
  const parsed = ImportBrainCsvBody.safeParse(req.body);
  if (!parsed.success) throw new BrainError(400, "Upload a contacts or won-deals CSV under 1 MB.");
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  const csv = parseCrmCsv(parsed.data.csv, parsed.data.kind);
  const result = await saveCrmRecords(client.agencyId, client.id, csv.records, "csv");
  res.json({ message: `${result.imported} CRM records imported.`, imported: result.imported, skipped: result.skipped + csv.skipped, warnings: csv.skipped ? ["Invalid rows and deals not marked won were skipped."] : [] });
});
router.post(`${base}/crm/hubspot`, limited, async (_req, res) => {
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  const data = await readHubspot();
  const result = await saveCrmRecords(client.agencyId, client.id, data.records, "hubspot");
  res.json({ message: `${result.imported} HubSpot companies and closed-won deals imported.`, ...result, warnings: data.warnings });
});
router.get(`${base}/learnings`, async (req, res) => {
  const client: typeof clients.$inferSelect = res.locals.brainClient;
  const vertical = req.query.vertical;
  if (vertical !== undefined && (typeof vertical !== "string" || vertical.length > 200)) throw new BrainError(400, "Enter a valid vertical filter.");
  const rows = await getLearnings(client.agencyId, client.id, typeof vertical === "string" ? vertical.trim() : undefined);
  res.json(rows.map(serializeEntry));
});
export default router;
