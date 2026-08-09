import assert from "node:assert/strict";
import test from "node:test";

import { EnvironmentConfigurationError, getTranscriptEnvironment, InvalidEnvironmentConfigurationError } from "../../lib/env";

function withEnvironment(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Supadata selection requires its server-side API key", () => {
  withEnvironment({ TRANSCRIPT_PROVIDER: "supadata", SUPADATA_API_KEY: undefined }, () => {
    assert.throws(() => getTranscriptEnvironment(), EnvironmentConfigurationError);
  });
});

test("transcript provider selection is explicit and validated", () => {
  withEnvironment({ TRANSCRIPT_PROVIDER: "unknown" }, () => {
    assert.throws(() => getTranscriptEnvironment(), InvalidEnvironmentConfigurationError);
  });
  withEnvironment({ TRANSCRIPT_PROVIDER: "supadata", SUPADATA_API_KEY: "server-secret" }, () => {
    assert.deepEqual(getTranscriptEnvironment(), { provider: "supadata", supadataApiKey: "server-secret" });
  });
});
