import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(value: string | Date | null | undefined, timeZone = "Asia/Dubai"): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const isArabic = (s: string | null | undefined) => /[؀-ۿ]/.test(s ?? "");

export const initials = (name: string | null | undefined) =>
  (name ?? "?")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const usd = (n: number | string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number(n) < 1 ? 4 : 2 }).format(Number(n));

export const FLAG: Record<string, string> = { AE: "🇦🇪", SA: "🇸🇦", QA: "🇶🇦", KW: "🇰🇼", BH: "🇧🇭", OM: "🇴🇲" };
