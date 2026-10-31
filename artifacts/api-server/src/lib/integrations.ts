import type { AlertPayload } from "./alerts";

const env = process.env;
export const direct = {
  trello: () => Boolean(env.TRELLO_KEY && env.TRELLO_TOKEN && env.TRELLO_LIST_ID),
  sms: () => Boolean(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM && env.ALERT_SMS_TO),
  asana: () => Boolean(env.ASANA_TOKEN && env.ASANA_PROJECT_ID),
  clickup: () => Boolean(env.CLICKUP_TOKEN && env.CLICKUP_LIST_ID),
};
export type DirectChannel = keyof typeof direct;

const title = (p: AlertPayload) => `${p.test ? "[Test] " : ""}🔥 ${p.company} — ${p.lead} (${p.score})`.slice(0, 250);
const text = (p: AlertPayload) => [`${p.lead} · ${p.title} · ${p.company}`, `Score ${p.score}/100 (${p.temperature})`, `Why now: ${p.why_now}`,
  ...p.signals.map(s => `• ${s.name}: ${s.title}${s.url ? ` (${s.url})` : ""}`), `Open: ${p.dashboard_url}`].join("\n");

async function ok(r: Response, what: string) { if (!r.ok) throw new Error(`${what} HTTP ${r.status}`); }

/** Sends via the provider's own API. Only call when direct[channel]() is true. */
export async function sendDirect(channel: DirectChannel, p: AlertPayload) {
  const signal = AbortSignal.timeout(15000);
  if (channel === "trello") {
    const q = new URLSearchParams({ key: env.TRELLO_KEY!, token: env.TRELLO_TOKEN!, idList: env.TRELLO_LIST_ID!, name: title(p), desc: text(p) });
    return ok(await fetch(`https://api.trello.com/1/cards?${q}`, { method: "POST", signal }), "Trello");
  }
  if (channel === "sms") {
    const body = new URLSearchParams({ To: env.ALERT_SMS_TO!, From: env.TWILIO_FROM!, Body: `${title(p)}\n${p.why_now}\n${p.dashboard_url}`.slice(0, 600) });
    return ok(await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, { method: "POST", signal, body,
      headers: { authorization: `Basic ${Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" } }), "Twilio");
  }
  if (channel === "asana") {
    return ok(await fetch("https://app.asana.com/api/1.0/tasks", { method: "POST", signal,
      headers: { authorization: `Bearer ${env.ASANA_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ data: { name: title(p), notes: text(p), projects: [env.ASANA_PROJECT_ID] } }) }), "Asana");
  }
  return ok(await fetch(`https://api.clickup.com/api/v2/list/${env.CLICKUP_LIST_ID}/task`, { method: "POST", signal,
    headers: { authorization: env.CLICKUP_TOKEN!, "content-type": "application/json" }, body: JSON.stringify({ name: title(p), description: text(p) }) }), "ClickUp");
}
