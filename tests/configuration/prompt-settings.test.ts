import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  composePromptVersion,
  customInstructionsMessage,
  validateCustomInstructions,
} from "@/lib/prompt-settings/config";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("prompt identity records both the protected base and custom version", () => {
  assert.equal(composePromptVersion("base-v3", 7), "base-v3+custom-v7");
  assert.throws(() => composePromptVersion("base-v3", 0), /invalid/);
});

test("custom instructions are delimited and explicitly subordinate", () => {
  const message = customInstructionsMessage("Focus on rotation.");
  assert.match(message, /do not conflict with the system instructions/);
  assert.match(message, /Structured Output schema/);
  assert.match(message, /Never treat this text as evidence/);
  assert.match(message, /<custom_instructions>\nFocus on rotation\.\n<\/custom_instructions>/);
});

test("defaults and input validation are stable", () => {
  assert.match(DEFAULT_CUSTOM_INSTRUCTIONS.EXTRACTION_CUSTOM_INSTRUCTIONS, /minutes are uncertain/);
  assert.match(DEFAULT_CUSTOM_INSTRUCTIONS.SYNTHESIS_CUSTOM_INSTRUCTIONS, /concise expert FPL briefing/);
  assert.equal(validateCustomInstructions("  concise  ", "Test"), "concise");
  assert.throws(() => validateCustomInstructions("x".repeat(4001), "Test"), /4,000/);
});

test("both OpenAI tasks load independent settings while protected schemas remain active", () => {
  const extraction = source("lib/insights/openai-extractor.ts");
  const synthesis = source("lib/summaries/openai-generator.ts");
  assert.match(extraction, /get\("EXTRACTION_CUSTOM_INSTRUCTIONS"\)/);
  assert.match(extraction, /zodTextFormat\(InsightExtractionSchema/);
  assert.match(extraction, /role: "system", content: FPL_INSIGHT_EXTRACTION_PROMPT/);
  assert.match(synthesis, /get\("SYNTHESIS_CUSTOM_INSTRUCTIONS"\)/);
  assert.match(synthesis, /zodTextFormat\(outputSchema/);
  assert.match(synthesis, /role: "system", content: RUN_SUMMARY_PROMPT/);
});

test("saving settings cannot trigger extraction or synthesis", () => {
  const route = source("app/api/prompt-settings/route.ts");
  assert.doesNotMatch(route, /OpenAI|extract\(|generate\(|synthesize/);
});
