// The one place enum vocabularies live. Server (Drizzle pgEnums, zod) and client import these.

export const ROLES = ["owner", "member", "client_viewer"] as const;
export type Role = (typeof ROLES)[number];

export const BRAIN_KINDS = ["website", "form", "crm", "learning"] as const;
export const SOURCE_TYPES = ["news", "funding", "hiring", "careers_page", "tender", "registry", "leadership"] as const;
export const TEMPERATURES = ["hot", "warm", "cold"] as const;
export type Temperature = (typeof TEMPERATURES)[number];
export const LEAD_STATUSES = ["new", "drafted", "ready", "sent", "replied", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const DRAFT_STATUSES = ["generated", "winner", "edited", "approved", "sent"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];
export const SIM_CHECKS = ["persona", "gmail_summary", "apple_preview", "spam"] as const;
export type SimCheck = (typeof SIM_CHECKS)[number];
export const MAILBOX_PROVIDERS = ["gmail", "outlook", "demo"] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];
export const MAILBOX_STATUSES = ["connected", "paused", "expired", "revoked"] as const;
export const SEND_STATUSES = ["scheduled", "sent", "failed", "bounced", "cancelled"] as const;
export type SendStatus = (typeof SEND_STATUSES)[number];
export const REPLY_CLASSES = ["positive", "neutral", "negative", "ooo", "unsubscribe"] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];
export const ALERT_CHANNELS = ["email", "sms", "webhook", "asana", "clickup", "trello"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];
export const MIN_TEMPERATURES = ["hot", "warm"] as const;
export const CASE_STUDY_SOURCES = ["upload", "url", "form", "website"] as const;
export const ANGLES = ["outcome", "signal", "proof"] as const;
export type Angle = (typeof ANGLES)[number];
export const LANGUAGES = ["en", "ar"] as const;
export type Language = (typeof LANGUAGES)[number];
export const PERSONA_ACTIONS = ["reply", "read_ignore", "skip", "spam"] as const;
export type PersonaAction = (typeof PERSONA_ACTIONS)[number];
export const SIZE_BANDS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"] as const;

export const GULF_COUNTRIES = ["AE", "SA", "QA", "KW", "BH", "OM"] as const;
export const COUNTRY_NAMES: Record<string, string> = {
  AE: "UAE",
  SA: "Saudi Arabia",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrain",
  OM: "Oman",
};

/** Thermometer bands: Hot ≥ 70 · Warm 40–69 · Cold < 40. */
export function temperatureOf(score: number): Temperature {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

export const PLAN = {
  name: "Agency",
  priceUsd: 399,
  includedClients: 5,
  includedSimulations: 2500,
  extraClientUsd: 59,
  simPackSize: 1000,
  simPackUsd: 49,
} as const;
