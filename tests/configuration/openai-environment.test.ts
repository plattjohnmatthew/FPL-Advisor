import assert from "node:assert/strict";
import test from "node:test";

import { getOpenAIEnvironment, EnvironmentConfigurationError } from "../../lib/env";
import { getModelPolicySnapshot, getOpenAIModel, getRepairModel } from "../../lib/openai/model-policy";

function withEnvironment(values: Record<string, string | undefined>, callback: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("API key must be configured explicitly", () => {
  withEnvironment({ OPENAI_API_KEY: undefined }, () => {
    assert.throws(() => getOpenAIEnvironment(), EnvironmentConfigurationError);
  });
});

test("invalid task model IDs fail clearly", () => {
  withEnvironment({ OPENAI_API_KEY: "test-key", OPENAI_EXTRACTION_MODEL: "not a model!" }, () => {
    assert.throws(() => getOpenAIModel("TRANSCRIPT_EXTRACTION"), /OPENAI_EXTRACTION_MODEL/);
  });
});

test("configured task model is returned unchanged", () => {
  withEnvironment({ OPENAI_API_KEY: "test-key", OPENAI_EXTRACTION_MODEL: "gpt-5.4-mini" }, () => {
    assert.deepEqual(getOpenAIEnvironment(), { apiKey: "test-key" });
    assert.equal(getOpenAIModel("TRANSCRIPT_EXTRACTION"), "gpt-5.4-mini");
  });
});

test("missing model overrides use only the explicit cost-controlled policy defaults", () => {
  withEnvironment({ OPENAI_EXTRACTION_MODEL: undefined, OPENAI_QUERY_MODEL: undefined, OPENAI_SPLIT_MODEL: undefined, OPENAI_SYNTHESIS_REDUCTION_MODEL: undefined, OPENAI_SYNTHESIS_MODEL: undefined, OPENAI_CHAT_MODEL: undefined }, () => {
    assert.deepEqual(getModelPolicySnapshot(), {
      TRANSCRIPT_EXTRACTION: "gpt-5.6-luna", QUERY_INTERPRETATION: "gpt-5.6-luna", SPLIT_DETECTION: "gpt-5.6-luna",
      SYNTHESIS_REDUCTION: "gpt-5.6-luna", SYNTHESIS: "gpt-5.4-mini", CHAT_ANSWER: "gpt-5.4-mini",
    });
  });
});

test("structured output repair preserves the original model", () => {
  assert.equal(getRepairModel("gpt-5.4-mini"), "gpt-5.4-mini");
  assert.equal(getRepairModel("gpt-5.6-luna"), "gpt-5.6-luna");
});
