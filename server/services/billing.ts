import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { PLAN } from "../../shared/enums";
import { db } from "../db";
import { agencies } from "../db/schema";
import { audit } from "../lib/audit";

/**
 * Stripe subscriptions. Agency plan USD 399/mo (5 clients, 2,500 simulated emails),
 * extra client USD 59/mo (subscription quantity), simulation packs (one-time).
 * Prices live in Stripe: STRIPE_PRICE_AGENCY, STRIPE_PRICE_EXTRA_CLIENT, STRIPE_PRICE_SIM_PACK.
 */
let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Billing is not configured (STRIPE_SECRET_KEY)");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

const price = (name: "STRIPE_PRICE_AGENCY" | "STRIPE_PRICE_EXTRA_CLIENT" | "STRIPE_PRICE_SIM_PACK") => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

async function customerFor(agencyId: string, email: string) {
  const [a] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
  if (a.stripeCustomerId) return a.stripeCustomerId;
  const c = await stripe().customers.create({ email, name: a.name, metadata: { agencyId } });
  await db.update(agencies).set({ stripeCustomerId: c.id }).where(eq(agencies.id, agencyId));
  return c.id;
}

export async function checkout(agencyId: string, email: string, kind: "plan" | "sim_pack", returnUrl: string, quantity = 1) {
  const customer = await customerFor(agencyId, email);
  const session =
    kind === "plan"
      ? await stripe().checkout.sessions.create({
          mode: "subscription",
          customer,
          line_items: [{ price: price("STRIPE_PRICE_AGENCY"), quantity: 1 }],
          subscription_data: { metadata: { agencyId } },
          metadata: { agencyId, kind },
          success_url: `${returnUrl}?billing=success`,
          cancel_url: `${returnUrl}?billing=cancel`,
        })
      : await stripe().checkout.sessions.create({
          mode: "payment",
          customer,
          line_items: [{ price: price("STRIPE_PRICE_SIM_PACK"), quantity }],
          metadata: { agencyId, kind, quantity: String(quantity) },
          success_url: `${returnUrl}?billing=success`,
          cancel_url: `${returnUrl}?billing=cancel`,
        });
  return session.url!;
}

/** Adds/removes extra-client seats on the subscription (USD 59/mo each). */
export async function setExtraClients(agencyId: string, userId: string, extra: number) {
  const [a] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
  if (!a.stripeSubscriptionId) throw new Error("Start the Agency plan first");
  const sub = await stripe().subscriptions.retrieve(a.stripeSubscriptionId);
  const item = sub.items.data.find((i) => i.price.id === price("STRIPE_PRICE_EXTRA_CLIENT"));
  if (item && extra === 0) await stripe().subscriptionItems.del(item.id, { proration_behavior: "create_prorations" });
  else if (item) await stripe().subscriptionItems.update(item.id, { quantity: extra, proration_behavior: "create_prorations" });
  else if (extra > 0) await stripe().subscriptionItems.create({ subscription: sub.id, price: price("STRIPE_PRICE_EXTRA_CLIENT"), quantity: extra, proration_behavior: "create_prorations" });
  await db.update(agencies).set({ extraClients: extra }).where(eq(agencies.id, agencyId));
  await audit({ agencyId, userId, action: "billing.extra_clients", entity: "agency", entityId: agencyId, meta: { extra } });
}

export async function portal(agencyId: string, returnUrl: string) {
  const [a] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
  if (!a.stripeCustomerId) throw new Error("No billing account yet");
  return (await stripe().billingPortal.sessions.create({ customer: a.stripeCustomerId, return_url: returnUrl })).url;
}

async function syncSubscription(sub: Stripe.Subscription) {
  const agencyId = sub.metadata.agencyId;
  if (!agencyId) return;
  const extra = sub.items.data.find((i) => i.price.id === process.env.STRIPE_PRICE_EXTRA_CLIENT)?.quantity ?? 0;
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  await db
    .update(agencies)
    .set({ plan: active ? "agency" : "canceled", stripeSubscriptionId: sub.id, subscriptionStatus: sub.status, extraClients: extra })
    .where(eq(agencies.id, agencyId));
}

export async function handleWebhook(rawBody: Buffer, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  const event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const agencyId = s.metadata?.agencyId;
      if (!agencyId) break;
      if (s.metadata?.kind === "sim_pack" && s.payment_status === "paid") {
        const [a] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
        const packs = Number(s.metadata.quantity ?? 1);
        await db.update(agencies).set({ simPackCredits: a.simPackCredits + packs * PLAN.simPackSize }).where(eq(agencies.id, agencyId));
        await audit({ agencyId, action: "billing.sim_pack", entity: "agency", entityId: agencyId, meta: { packs } });
      } else if (typeof s.subscription === "string") {
        await syncSubscription(await stripe().subscriptions.retrieve(s.subscription));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
  }
  return event.type;
}
