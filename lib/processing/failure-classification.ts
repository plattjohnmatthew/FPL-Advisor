import OpenAI from "openai";
import { TranscriptAcquisitionError } from "@/lib/transcripts/provider";

export function isRetryableFailure(error: unknown) {
  if (error instanceof TranscriptAcquisitionError) return error.kind === "TRANSIENT";
  if (error instanceof OpenAI.APIError) {
    return error.status === undefined || error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
  }
  return false;
}
