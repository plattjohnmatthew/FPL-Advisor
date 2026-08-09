import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableFailure } from "../../lib/processing/failure-classification";
import { TranscriptAcquisitionError } from "../../lib/transcripts/provider";

test("validation and deterministic database shape failures are non-transient", () => {
  assert.equal(isRetryableFailure(new Error("Extraction validation failed: field=entities expected=array received=object")), false);
  assert.equal(isRetryableFailure(new Error("cannot extract elements from a scalar")), false);
});

test("only explicitly transient transcript failures retry automatically", () => {
  assert.equal(isRetryableFailure(new TranscriptAcquisitionError("timeout", "TRANSIENT")), true);
  assert.equal(isRetryableFailure(new TranscriptAcquisitionError("unavailable", "PERMANENT")), false);
});
