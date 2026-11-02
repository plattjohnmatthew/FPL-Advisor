import "server-only";

import { getEncoding } from "js-tiktoken";
import { InvalidEnvironmentConfigurationError } from "@/lib/env";

const encoding = getEncoding("o200k_base");

function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) throw new InvalidEnvironmentConfigurationError(name, "must be a positive integer token count");
  return Number(raw);
}

export function getSynthesisTokenBudget() {
  const reservedOutputTokens = positiveInteger("SYNTHESIS_RESERVED_OUTPUT_TOKENS", 12_000);
  const safetyMarginTokens = positiveInteger("SYNTHESIS_SAFETY_MARGIN_TOKENS", 40_000);
  const finalContextTokens = positiveInteger("SYNTHESIS_CONTEXT_WINDOW_TOKENS", 400_000);
  const reductionContextTokens = positiveInteger("SYNTHESIS_REDUCTION_CONTEXT_WINDOW_TOKENS", 400_000);
  const finalCapacity = finalContextTokens - reservedOutputTokens - safetyMarginTokens;
  const reductionCapacity = reductionContextTokens - reservedOutputTokens - safetyMarginTokens;
  if (finalCapacity <= 0 || reductionCapacity <= 0) throw new InvalidEnvironmentConfigurationError("SYNTHESIS_RESERVED_OUTPUT_TOKENS", "reserved output plus safety margin must be below configured context windows");
  return {
    directMaxInputTokens: Math.min(positiveInteger("SYNTHESIS_MAX_INPUT_TOKENS", 180_000), finalCapacity),
    reductionMaxInputTokens: Math.min(positiveInteger("SYNTHESIS_REDUCTION_MAX_INPUT_TOKENS", 80_000), reductionCapacity),
    reservedOutputTokens, safetyMarginTokens, finalContextTokens, reductionContextTokens,
  };
}

export function estimateTokens(...values: unknown[]) {
  return values.reduce<number>((total, value) => total + encoding.encode(typeof value === "string" ? value : JSON.stringify(value)).length, 0);
}

export function assertWithinTokenBudget(label: string, tokens: number, maximum: number) {
  if (tokens > maximum) throw new Error(`${label} requires ${tokens} estimated input tokens, above the configured safe limit of ${maximum}.`);
}

export function selectSynthesisMode(inputTokens: number, maximum: number): "DIRECT" | "HIERARCHICAL" {
  return inputTokens <= maximum ? "DIRECT" : "HIERARCHICAL";
}
