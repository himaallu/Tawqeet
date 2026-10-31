import { localParts, nextLocalTime } from "./gulf-time";

/**
 * Alert delivery cadence:
 * - Hot: alert when drafts are ready. PM task + email anytime; SMS only 08:00–21:00 client
 *   local time, otherwise held until 08:00. Max 5 individual hot alerts per client per day;
 *   the rest are bundled into one message.
 * - Warm: no instant alert; daily digest at 08:30 on client workdays.
 * - Cold: weekly summary on the first workday.
 * - No repeat alert for the same lead within 7 days unless its score rose by 15+.
 */
export const HOT_ALERTS_PER_DAY = 5;
export const REPEAT_WINDOW_DAYS = 7;
export const REPEAT_SCORE_JUMP = 15;

export function shouldRealert(last: { at: Date | null; score: number | null }, score: number, now = new Date()): boolean {
  if (!last.at || last.score === null) return true;
  const withinWindow = now.getTime() - last.at.getTime() < REPEAT_WINDOW_DAYS * 86_400_000;
  return !withinWindow || score - last.score >= REPEAT_SCORE_JUMP;
}

/** When an SMS may go out: now if inside 08:00–21:00 local, else the next 08:00. */
export function smsSendTime(now: Date, timezone: string): Date {
  const { hour } = localParts(now, timezone);
  return hour >= 8 && hour < 21 ? now : nextLocalTime(now, timezone, 8, 0);
}
