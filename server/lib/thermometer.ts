import { temperatureOf, type Temperature } from "../../shared/enums";
import type { ScoreBreakdown } from "../db/schema";

/**
 * Thermometer (0–100):
 *   signal_points = Σ base_weight × 0.5^(age_days / half_life_days)        (cap 50)
 *   stack_bonus   = +10 if 2+ different signal types in 30 days, +15 if 3+
 *   fit_points    = AI ICP fit (0–25)
 *   engagement    = +15 if they replied before, +5 if they clicked          (cap 15)
 *   temp_score    = min(100, signal_points + stack_bonus + fit_points + engagement)
 *   Hot ≥ 70 · Warm 40–69 · Cold < 40
 */
export type ScoredSignal = {
  id: string;
  key: string;
  title: string;
  detectedAt: Date;
  baseWeight: number;
  halfLifeDays: number;
};

export type Engagement = { replied: boolean; clicked: boolean };

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeScore(
  signals: ScoredSignal[],
  fit: number,
  engagement: Engagement = { replied: false, clicked: false },
  now = new Date(),
): ScoreBreakdown & { temperature: Temperature } {
  const scored = signals.map((s) => {
    const ageDays = Math.max(0, (now.getTime() - s.detectedAt.getTime()) / DAY);
    const points = s.baseWeight * Math.pow(0.5, ageDays / Math.max(1, s.halfLifeDays));
    return { id: s.id, key: s.key, title: s.title, points: round1(points), ageDays: round1(ageDays) };
  });
  const signalPoints = Math.min(50, scored.reduce((sum, s) => sum + s.points, 0));
  const recentTypes = new Set(scored.filter((s) => s.ageDays <= 30).map((s) => s.key));
  const stackBonus = recentTypes.size >= 3 ? 15 : recentTypes.size >= 2 ? 10 : 0;
  const fitPoints = Math.max(0, Math.min(25, fit));
  const engagementPoints = Math.min(15, (engagement.replied ? 15 : 0) + (engagement.clicked ? 5 : 0));
  const total = Math.min(100, Math.round(signalPoints + stackBonus + fitPoints + engagementPoints));
  return {
    signalPoints: round1(signalPoints),
    stackBonus,
    fitPoints,
    engagement: engagementPoints,
    total,
    temperature: temperatureOf(total),
    signals: scored.sort((a, b) => b.points - a.points),
  };
}
