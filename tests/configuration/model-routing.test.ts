import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("each OpenAI adapter is bound to its intended central task policy", () => {
  assert.match(source("lib/insights/openai-extractor.ts"), /getOpenAIModel\("TRANSCRIPT_EXTRACTION"\)/);
  assert.doesNotMatch(source("lib/insights/openai-extractor.ts"), /getOpenAIModel\("SYNTHESIS"\)/);
  assert.match(source("lib/research/openai.ts"), /getOpenAIModel\("QUERY_INTERPRETATION"\)/);
  assert.match(source("lib/research/service.ts"), /getOpenAIModel\("CHAT_ANSWER"\)/);
  assert.doesNotMatch(source("lib/research/service.ts"), /getOpenAIModel\("TRANSCRIPT_EXTRACTION"\)/);
  assert.match(source("lib/splits/openai-detector.ts"), /getOpenAIModel\("SPLIT_DETECTION"\)/);
  assert.match(source("lib/summaries/openai-generator.ts"), /getOpenAIModel\("SYNTHESIS"\)/);
  assert.match(source("lib/summaries/openai-generator.ts"), /getOpenAIModel\("SYNTHESIS_REDUCTION"\)/);
});

test("every Responses API call is wrapped by normalized usage tracking", () => {
  for (const path of ["lib/insights/openai-extractor.ts", "lib/research/openai.ts", "lib/splits/openai-detector.ts", "lib/summaries/openai-generator.ts"]) {
    const contents = source(path);
    assert.equal((contents.match(/responses\.parse/g) ?? []).length, (contents.match(/trackOpenAICall/g) ?? []).length - 1, path);
  }
});
