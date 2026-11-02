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
  withEnvironment({ TRANSCRIPT_PROVIDER_PRIMARY: undefined, TRANSCRIPT_PROVIDER: "supadata", TRANSCRIPT_PROVIDER_FALLBACK: undefined, SUPADATA_API_KEY: "server-secret", SUPADATA_ALLOW_AI_FALLBACK: undefined }, () => {
    assert.deepEqual(getTranscriptEnvironment(), { primary: "supadata", fallback: "none", supadataApiKey: "server-secret", supadataAllowAiFallback: false, youtubeTranscriptPythonCommand: "python" });
  });
  withEnvironment({ TRANSCRIPT_PROVIDER: "supadata", SUPADATA_API_KEY: "server-secret", SUPADATA_ALLOW_AI_FALLBACK: "true" }, () => {
    assert.equal(getTranscriptEnvironment().supadataAllowAiFallback, true);
  });
  withEnvironment({ TRANSCRIPT_PROVIDER: "supadata", SUPADATA_API_KEY: "server-secret", SUPADATA_ALLOW_AI_FALLBACK: "sometimes" }, () => {
    assert.throws(() => getTranscriptEnvironment(), InvalidEnvironmentConfigurationError);
  });
});

test("primary and fallback provider order is explicit and safe", () => {
  withEnvironment({ TRANSCRIPT_PROVIDER_PRIMARY: "supadata", TRANSCRIPT_PROVIDER_FALLBACK: "youtube_local", SUPADATA_API_KEY: "secret" }, () => {
    assert.deepEqual(getTranscriptEnvironment(), { primary: "supadata", fallback: "youtube_local", supadataApiKey: "secret", supadataAllowAiFallback: false, youtubeTranscriptPythonCommand: "python" });
  });
  withEnvironment({ TRANSCRIPT_PROVIDER_PRIMARY: "youtube_local", TRANSCRIPT_PROVIDER_FALLBACK: "supadata", SUPADATA_API_KEY: "secret" }, () => {
    assert.equal(getTranscriptEnvironment().primary, "youtube_local");
  });
  withEnvironment({ TRANSCRIPT_PROVIDER_PRIMARY: "youtube_local", TRANSCRIPT_PROVIDER_FALLBACK: "none", SUPADATA_API_KEY: undefined }, () => {
    assert.deepEqual(getTranscriptEnvironment(), { primary: "youtube_local", fallback: "none", supadataAllowAiFallback: false, youtubeTranscriptPythonCommand: "python" });
  });
  withEnvironment({ TRANSCRIPT_PROVIDER_PRIMARY: "supadata", TRANSCRIPT_PROVIDER_FALLBACK: "supadata", SUPADATA_API_KEY: "secret" }, () => {
    assert.throws(() => getTranscriptEnvironment(), InvalidEnvironmentConfigurationError);
  });
  withEnvironment({ TRANSCRIPT_PROVIDER_PRIMARY: "youtube_local", TRANSCRIPT_PROVIDER_FALLBACK: "none", YOUTUBE_TRANSCRIPT_PYTHON_COMMAND: "py" }, () => {
    assert.equal(getTranscriptEnvironment().youtubeTranscriptPythonCommand, "py");
  });
});
