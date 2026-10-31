import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, clients } from "@workspace/db";
import { CreateClientBody, GetClientParams, GetClientResponse, ListClientsResponse } from "@workspace/api-zod";
import { requireUser, requireOwner, requireAgencyStaff } from "../lib/security";
const router: IRouter = Router();
router.use("/clients", requireUser, requireAgencyStaff);
const serialize = (client: typeof clients.$inferSelect) => ({ ...client, createdAt: client.createdAt.toISOString() });

function parseInput(value: unknown) {
  const parsed = CreateClientBody.safeParse(value);
  if (!parsed.success) return null;
  const data = parsed.data;
  if (!data.name.trim()) return null;
  if (data.website) {
    try { if (!["http:", "https:"].includes(new URL(data.website).protocol)) return null; } catch { return null; }
  }
  for (const array of [data.verticals, data.regions, data.languages, data.noGoClaims]) {
    if (array && (array.length > 100 || array.some(v => v.length > 500))) return null;
  }
  return { ...data, name: data.name.trim() };
}
router.get("/clients", async (req, res): Promise<void> => {
  const rows = await db.select().from(clients).where(eq(clients.agencyId, req.user!.agencyId)).orderBy(desc(clients.createdAt));
  res.json(ListClientsResponse.parse(rows.map(serialize)));
});
router.post("/clients", async (req, res): Promise<void> => {
  const input = parseInput(req.body);
  if (!input) { res.status(400).json({ error: "Enter a client name, valid http(s) website, and valid profile fields." }); return; }
  const [client] = await db.insert(clients).values({ ...input, agencyId: req.user!.agencyId }).returning();
  res.status(201).json(GetClientResponse.parse(serialize(client!)));
});
router.get("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid client ID." }); return; }
  const [client] = await db.select().from(clients).where(and(eq(clients.id, params.data.id), eq(clients.agencyId, req.user!.agencyId))).limit(1);
  if (!client) { res.status(404).json({ error: "Client not found." }); return; }
  res.json(GetClientResponse.parse(serialize(client)));
});
router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  const input = parseInput(req.body);
  if (!params.success || !input) { res.status(400).json({ error: "Enter a client name, valid http(s) website, and valid profile fields." }); return; }
  const [client] = await db.update(clients).set(input).where(and(eq(clients.id, params.data.id), eq(clients.agencyId, req.user!.agencyId))).returning();
  if (!client) { res.status(404).json({ error: "Client not found." }); return; }
  res.json(GetClientResponse.parse(serialize(client)));
});
router.delete("/clients/:id", requireOwner, async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid client ID." }); return; }
  const [client] = await db.delete(clients).where(and(eq(clients.id, params.data.id), eq(clients.agencyId, req.user!.agencyId))).returning();
  if (!client) { res.status(404).json({ error: "Client not found." }); return; }
  res.json({ message: "Client and associated data deleted." });
});
export default router;
