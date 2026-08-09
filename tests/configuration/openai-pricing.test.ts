import assert from "node:assert/strict";
import test from "node:test";
import { estimateOpenAICostUsd } from "../../lib/openai/pricing";

test("cost estimation separates cached and uncached input tokens", () => {
  assert.equal(estimateOpenAICostUsd("gpt-5.6-luna", { inputTokens: 1_000_000, cachedInputTokens: 250_000, outputTokens: 100_000, totalTokens: 1_100_000 }), 0.275);
});

test("unknown override models do not receive invented prices", () => {
  assert.equal(estimateOpenAICostUsd("gpt-custom-model", { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, totalTokens: 15 }), null);
});
