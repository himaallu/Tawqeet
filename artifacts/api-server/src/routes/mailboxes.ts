import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, clients, mailboxes } from "@workspace/db";
import { requireUser, requireAgencyStaff } from "../lib/security";
import { audit } from "../lib/compliance";
import { providerConfigured, encryptionReady, realSend, redirectUri, makeState, readState, authorizeUrl, connect, type Provider } from "../lib/mailbox";

const router = Router();
router.use("/mailboxes", requireUser, requireAgencyStaff);
const base = () => (process.env.BASE_PATH || "/").replace(/\/$/, "");
const isProvider = (p: string): p is Provider => p === "gmail" || p === "outlook";

router.get("/mailboxes", async (req, res) => {
  const agencyId = req.user!.agencyId;
  const [boxes, list] = await Promise.all([
    db.select().from(mailboxes).where(eq(mailboxes.agencyId, agencyId)),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.agencyId, agencyId)),
  ]);
  const uri = (p: Provider) => { try { return redirectUri(p); } catch { return null; } };
  res.json({ realSend: realSend(), encryptionReady: encryptionReady(), clients: list,
    providers: (["gmail", "outlook"] as const).map(p => ({ provider: p, name: p === "gmail" ? "Gmail / Google Workspace" : "Outlook / Microsoft 365",
      configured: providerConfigured(p) && encryptionReady(), scope: p === "gmail" ? "gmail.send" : "Mail.Send (+ offline_access)", redirectUri: uri(p),
      connections: boxes.filter(b => b.provider === p && b.status === "connected").map(b => ({ clientId: b.clientId,
        clientName: list.find(c => c.id === b.clientId)?.name ?? "", email: b.email, status: b.status })) })) });
});
router.get("/mailboxes/oauth/:provider/start", async (req, res) => {
  const p = String(req.params.provider), clientId = String(req.query.clientId || "");
  if (!isProvider(p) || !providerConfigured(p) || !encryptionReady()) { res.status(400).json({ error: "This mailbox provider is not configured." }); return; }
  const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.agencyId, req.user!.agencyId), eq(clients.id, clientId)));
  if (!client) { res.status(404).json({ error: "Client not found." }); return; }
  res.redirect(authorizeUrl(p, makeState(client.id, req.user!.id)));
});
router.get("/mailboxes/oauth/:provider/callback", async (req, res) => {
  const p = String(req.params.provider);
  const back = (q: string) => res.redirect(`${base()}/settings/mailboxes?${q}`);
  const state = readState(String(req.query.state || ""));
  if (!isProvider(p) || !state || state.userId !== req.user!.id || typeof req.query.code !== "string") { back("error=invalid_state"); return; }
  const [client] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.agencyId, req.user!.agencyId), eq(clients.id, state.clientId)));
  if (!client) { back("error=client"); return; }
  try {
    await connect(p, req.user!.agencyId, client.id, req.query.code);
    await audit(req.user!.agencyId, req.user!.id, "mailbox.connect", `${p} for ${client.name}`);
    back(`connected=${p}`);
  } catch { back("error=token"); }
});
export default router;
