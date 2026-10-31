import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, aiUsage, clients } from "@workspace/db";

export async function generateForAgency<T>(input: {
  agencyId: string; clientId?: string; purpose: string; prompt: string; schema: z.ZodType<T>;
  provider?: "anthropic" | "gemini" | "openai"; model?: string;
}): Promise<T> {
  if (input.clientId) {
    const [client] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.agencyId, input.agencyId))).limit(1);
    if (!client) throw new Error("Client not found in agency.");
  }
  const provider = input.provider || process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
  const modelName = input.model || process.env.AI_MODEL;
  if (!modelName) throw new Error("Configure AI_MODEL before using AI.");
  const key = provider === "gemini" ? process.env.GEMINI_API_KEY : provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) throw new Error(`No API key configured for AI provider ${provider}.`);
  const model = provider === "gemini" ? createGoogleGenerativeAI({ apiKey: key })(modelName)
    : provider === "anthropic" ? createAnthropic({ apiKey: key })(modelName)
    : provider === "openai" ? createOpenAI({ apiKey: key })(modelName) : null;
  if (!model) throw new Error("AI_PROVIDER must be gemini, anthropic or openai.");
  const result = await generateObject({ model, schema: input.schema, prompt: input.prompt, maxRetries: 2, abortSignal: AbortSignal.timeout(120_000) });
  const tokensIn = result.usage.inputTokens ?? 0;
  const tokensOut = result.usage.outputTokens ?? 0;
  const inRate = Number(process.env.AI_INPUT_COST_PER_MILLION);
  const outRate = Number(process.env.AI_OUTPUT_COST_PER_MILLION);
  const priced = Boolean(process.env.AI_INPUT_COST_PER_MILLION && process.env.AI_OUTPUT_COST_PER_MILLION)
    && Number.isFinite(inRate) && Number.isFinite(outRate) && inRate >= 0 && outRate >= 0;
  await db.insert(aiUsage).values({
    agencyId: input.agencyId, clientId: input.clientId, purpose: input.purpose, model: `${provider}/${modelName}`,
    tokensIn, tokensOut, costUsd: priced ? ((tokensIn * inRate + tokensOut * outRate) / 1_000_000).toFixed(8) : null,
  });
  return result.object;
}
