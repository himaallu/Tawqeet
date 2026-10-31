import { Router } from "express";
import { db, signalDefinitions } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireUser, requireOwner, requireAgencyStaff } from "../lib/security";
import { leadEvidence } from "../lib/signals/scoring";
import { SIGNAL_KEYS } from "../lib/signals/catalog";

const router = Router();
const edits = z.object({
  baseWeight: z.number().int().min(-40).max(40), halfLifeDays: z.number().int().min(1).max(3650),
  verticalMultipliers: z.object({ saas: z.number().min(0).max(10), re: z.number().min(0).max(10), hr: z.number().min(0).max(10) }).strict(),
  keywordsEn: z.array(z.string().trim().min(1).max(200)).max(100), keywordsAr: z.array(z.string().trim().min(1).max(200)).max(100),
  active: z.boolean(),
}).strict();
router.get("/settings/signals", requireUser, requireAgencyStaff, async (_req, res) => {
  const definitions = await db.select().from(signalDefinitions).where(inArray(signalDefinitions.key, SIGNAL_KEYS)).orderBy(signalDefinitions.name);
  res.json({ count: definitions.length, definitions });
});
router.patch("/settings/signals/:key", requireUser, requireOwner, async (req, res) => {
  const parsed = edits.safeParse(req.body);
  if (!parsed.success || !SIGNAL_KEYS.includes(String(req.params.key))) { res.status(400).json({ error: "Invalid signal settings." }); return; }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(842733)`);
    const [definition] = await tx.select().from(signalDefinitions).where(eq(signalDefinitions.key, String(req.params.key)));
    if (!definition) return null;
    if ((definition.isNegative && parsed.data.baseWeight > 0) || (!definition.isNegative && parsed.data.baseWeight < 0)) return false;
    const [updated] = await tx.update(signalDefinitions).set(parsed.data).where(eq(signalDefinitions.id, definition.id)).returning();
    await leadEvidence(undefined, tx, true);
    return updated;
  });
  if (result === false) { res.status(400).json({ error: "Negative signals must keep a non-positive weight; other signals must keep a non-negative weight." }); return; }
  if (!result) { res.status(404).json({ error: "Signal definition not found." }); return; }
  res.json(result);
});
router.get("/leads/signals", requireUser, requireAgencyStaff, async (req, res) => {
  res.json(await leadEvidence(req.user!.agencyId));
});
export default router;
