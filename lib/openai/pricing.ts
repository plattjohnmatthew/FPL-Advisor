export type OpenAITokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number };

type TokenPricing = { inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number };

// Update from the official OpenAI model pages when prices change.
export const OPENAI_TOKEN_PRICING_USD: Readonly<Record<string, TokenPricing>> = {
  "gpt-5.6-luna": { inputPerMillion: 0.20, cachedInputPerMillion: 0.02, outputPerMillion: 1.20 },
  "gpt-5.4-mini": { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.50 },
};

export function estimateOpenAICostUsd(model: string, usage: OpenAITokenUsage): number | null {
  const pricing = OPENAI_TOKEN_PRICING_USD[model];
  if (!pricing) return null;
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (uncachedInput * pricing.inputPerMillion + usage.cachedInputTokens * pricing.cachedInputPerMillion + usage.outputTokens * pricing.outputPerMillion) / 1_000_000;
}
