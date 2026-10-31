import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import type { z } from "zod";
import { db } from "../db";
import { aiUsage } from "../db/schema";

/**
 * Every AI call goes through aiObject(). The provider is AI_PROVIDER, or whichever key is set
 * (Gemini → Anthropic → OpenAI). Every call is logged to ai_usage with tokens and cost.
 *
 * Offline mode (no key outside production, or AI_OFFLINE=1): each call returns the caller's
 * deterministic `offline` value instead, so the seeded demo and tests run without network.
 * Settings › System check shows AI as red in that state.
 */
export type AiProvider = "gemini" | "anthropic" | "openai";
export type Tier = "default" | "fast";

const MODELS: Record<AiProvider, Record<Tier, string>> = {
  gemini: { default: "gemini-2.5-flash", fast: "gemini-2.5-flash-lite" },
  anthropic: { default: "claude-sonnet-5-5", fast: "claude-haiku-5-5" },
  openai: { default: "gpt-5-mini", fast: "gpt-5-nano" },
};

// USD per 1M tokens [input, output]. Check against provider price pages; unknown models log 0.
const PRICES: Record<string, [number, number]> = {
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-2.5-flash-lite": [0.1, 0.4],
  "claude-sonnet-5-5": [3, 15],
  "claude-haiku-5-5": [1, 5],
  "gpt-5-mini": [0.25, 2],
  "gpt-5-nano": [0.05, 0.4],
};

const KEY_ENV: Record<AiProvider, string> = {
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

export function activeProvider(): AiProvider | null {
  if (process.env.AI_OFFLINE === "1") return null;
  const explicit = process.env.AI_PROVIDER as AiProvider | undefined;
  if (explicit && explicit in MODELS) return process.env[KEY_ENV[explicit]] ? explicit : null;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

/** Offline when no key is set outside production, or when AI_OFFLINE=1 (seed, tests). */
export function offlineMode(): boolean {
  return activeProvider() === null && (process.env.NODE_ENV !== "production" || process.env.AI_OFFLINE === "1");
}

function model(provider: AiProvider, tier: Tier): { model: LanguageModel; name: string } {
  const name = (tier === "default" && process.env.AI_MODEL) || MODELS[provider][tier];
  const apiKey = process.env[KEY_ENV[provider]];
  switch (provider) {
    case "gemini":
      return { model: createGoogleGenerativeAI({ apiKey })(name), name };
    case "anthropic":
      return { model: createAnthropic({ apiKey })(name), name };
    case "openai":
      return { model: createOpenAI({ apiKey })(name), name };
  }
}

export function costUsd(modelName: string, tokensIn: number, tokensOut: number): number {
  const [pin, pout] = PRICES[modelName] ?? [0, 0];
  return (tokensIn * pin + tokensOut * pout) / 1_000_000;
}

export type AiCall<S extends z.ZodType> = {
  agencyId: string | null;
  clientId?: string | null;
  purpose: string;
  schema: S;
  system?: string;
  prompt: string;
  tier?: Tier;
  /** Prefer this provider when its key is set (e.g. Gemini for the Gmail-style summary). */
  prefer?: AiProvider;
  /** Deterministic result used in offline mode. */
  offline: () => z.infer<S>;
};

export async function aiObject<S extends z.ZodType>(call: AiCall<S>): Promise<z.infer<S>> {
  const provider = call.prefer && process.env[KEY_ENV[call.prefer]] ? call.prefer : activeProvider();
  if (!provider) {
    if (!offlineMode()) {
      throw new Error("No AI provider key set (GEMINI_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY)");
    }
    const value = call.schema.parse(call.offline());
    await logUsage(call, "offline-mock", 0, 0);
    return value;
  }
  const { model: m, name } = model(provider, call.tier ?? "default");
  const result = await generateObject({ model: m, schema: call.schema, system: call.system, prompt: call.prompt });
  await logUsage(call, name, result.usage.inputTokens ?? 0, result.usage.outputTokens ?? 0);
  return result.object as z.infer<S>;
}

async function logUsage(call: AiCall<z.ZodType>, modelName: string, tokensIn: number, tokensOut: number) {
  await db.insert(aiUsage).values({
    agencyId: call.agencyId,
    clientId: call.clientId ?? null,
    purpose: call.purpose,
    model: modelName,
    tokensIn,
    tokensOut,
    costUsd: costUsd(modelName, tokensIn, tokensOut).toFixed(6),
  });
}
