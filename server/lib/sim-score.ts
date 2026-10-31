import { askCount, wordCount } from "./spam";

/**
 * score = 50 × avg(reply_likelihood) + 25 × offer_survives + 15 × (1 − spam_risk) + 10 × clarity
 */
export function clarity(body: string): number {
  return wordCount(body) <= 120 && askCount(body) === 1 ? 1 : 0.5;
}

export function simScore(input: { replyLikelihoods: number[]; offerSurvives: number; spamRisk: number; clarity: number }): number {
  const avg = input.replyLikelihoods.length
    ? input.replyLikelihoods.reduce((a, b) => a + b, 0) / input.replyLikelihoods.length
    : 0;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return Math.round(
    50 * clamp(avg) + 25 * clamp(input.offerSurvives) + 15 * (1 - clamp(input.spamRisk)) + 10 * clamp(input.clarity),
  );
}

export const WINNER_REWRITE_THRESHOLD = 60;
