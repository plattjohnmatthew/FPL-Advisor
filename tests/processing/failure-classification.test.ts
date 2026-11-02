import assert from "node:assert/strict";
import test from "node:test";
import { isAutomaticEpisodeRetryEligible, isRetryableFailure } from "../../lib/processing/failure-classification";
import { TranscriptAcquisitionError } from "../../lib/transcripts/provider";

test("validation and deterministic database shape failures are non-transient", () => {
  assert.equal(isRetryableFailure(new Error("Extraction validation failed: field=entities expected=array received=object")), false);
  assert.equal(isRetryableFailure(new Error("cannot extract elements from a scalar")), false);
});

test("permanent transcript failures are excluded from later automatic runs but transient failures remain eligible", () => {
  assert.equal(isAutomaticEpisodeRetryEligible({ stage: "TRANSCRIPT_ACQUISITION", retryable: false }), false);
  assert.equal(isAutomaticEpisodeRetryEligible({ stage: "TRANSCRIPT_ACQUISITION", retryable: true }), true);
  assert.equal(isAutomaticEpisodeRetryEligible({ stage: "EXTRACTION", retryable: false }), true);
  assert.equal(isAutomaticEpisodeRetryEligible(undefined), true);
});

test("only explicitly transient transcript failures retry automatically", () => {
  assert.equal(isRetryableFailure(new TranscriptAcquisitionError("timeout", "TRANSIENT")), true);
  assert.equal(isRetryableFailure(new TranscriptAcquisitionError("unavailable", "PERMANENT")), false);
});
