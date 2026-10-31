import { Router } from "express";
import { verifySvix, handleInbound } from "../lib/inbound";
import { logger } from "../lib/logger";

const router = Router();
// Resend inbound (email.received). Raw body is captured in app.ts for signature verification.
router.post("/webhooks/inbound", async (req, res) => {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) { res.status(404).json({ error: "Inbound replies are not configured." }); return; }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!verifySvix(raw, req.headers as Record<string, string>, secret)) { res.status(401).json({ error: "Invalid signature." }); return; }
  try { res.json({ message: await handleInbound(JSON.parse(raw)) }); }
  catch (e) { logger.warn({ errorName: e instanceof Error ? e.name : "Unknown" }, "Inbound reply failed"); res.status(200).json({ message: "ignored: processing error" }); }
});
export default router;
