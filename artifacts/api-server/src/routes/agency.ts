import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agencies } from "@workspace/db";
import { GetAgencyResponse, UpdateAgencyBody } from "@workspace/api-zod";
import { requireUser, requireOwner, requireAgencyStaff } from "../lib/security";
const router: IRouter = Router();
router.use("/agency", requireUser, requireAgencyStaff);
router.get("/agency", async (req, res): Promise<void> => {
  const [agency] = await db.select().from(agencies).where(eq(agencies.id, req.user!.agencyId)).limit(1);
  if (!agency) { res.status(404).json({ error: "Agency not found." }); return; }
  res.json(GetAgencyResponse.parse({ ...agency, createdAt: agency.createdAt.toISOString() }));
});
router.patch("/agency", requireOwner, async (req, res): Promise<void> => {
  const input = UpdateAgencyBody.safeParse(req.body);
  if (!input.success || !input.data.name.trim()) { res.status(400).json({ error: "Agency name is required (120 characters maximum)." }); return; }
  const [agency] = await db.update(agencies).set({ name: input.data.name.trim() }).where(eq(agencies.id, req.user!.agencyId)).returning();
  if (!agency) { res.status(404).json({ error: "Agency not found." }); return; }
  res.json(GetAgencyResponse.parse({ ...agency, createdAt: agency.createdAt.toISOString() }));
});
export default router;
