import type { StoredEpisode } from "@/lib/processing/types";

export type TranscriptSegment = {
  startSeconds: number;
  endSeconds?: number;
  text: string;
};

export type NormalizedTranscriptResult = {
  rawText: string;
  language: string | null;
  durationSeconds: number | null;
  providerName: string;
  segments?: TranscriptSegment[];
  audit?: TranscriptProviderAuditMetadata;
};

export type TranscriptRequestTrigger = "CREATOR_DISCOVERY" | "AUTOMATIC_RETRY" | "URL_BATCH" | "URL_BATCH_RETRY" | "MANUAL_RETRY" | "MANUAL_RESUME";
export type TranscriptProviderRole = "PRIMARY" | "FALLBACK";
export type TranscriptErrorCategory =
  | "QUOTA_EXHAUSTED" | "RATE_LIMITED" | "TRANSCRIPT_UNAVAILABLE" | "VIDEO_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE" | "REQUEST_BLOCKED" | "INVALID_REQUEST" | "MALFORMED_RESPONSE" | "CONFIGURATION"
  | "PYTHON_NOT_FOUND" | "PACKAGE_NOT_INSTALLED" | "SCRIPT_ERROR";
export type TranscriptAcquisitionContext = {
  processingRunId: string; trigger: TranscriptRequestTrigger; transcriptExistedBeforeCall: boolean;
  providerRole?: TranscriptProviderRole; fallbackReason?: TranscriptErrorCategory | null; configuredFallbackProvider?: string | null;
};
export type TranscriptProviderAuditMetadata = {
  responseStatus: number | null;
  aiFallbackAllowed: boolean;
  aiFallbackUsed: boolean | null;
  httpRequestCount: number;
  retryAttemptCount: number;
  billableRequestCount: number | null;
};

export interface TranscriptProvider {
  acquireTranscript(episode: StoredEpisode, context?: TranscriptAcquisitionContext): Promise<NormalizedTranscriptResult>;
}

export type TranscriptFailureKind = "TRANSIENT" | "PERMANENT" | "CONFIGURATION";

export class TranscriptAcquisitionError extends Error {
  audit?: TranscriptProviderAuditMetadata;
  constructor(message: string, readonly kind: TranscriptFailureKind, readonly category: TranscriptErrorCategory = kind === "CONFIGURATION" ? "CONFIGURATION" : "PROVIDER_UNAVAILABLE") {
    super(message);
    this.name = "TranscriptAcquisitionError";
  }
}

const FALLBACK_ELIGIBLE_CATEGORIES = new Set<TranscriptErrorCategory>(["QUOTA_EXHAUSTED", "RATE_LIMITED", "PROVIDER_UNAVAILABLE", "REQUEST_BLOCKED"]);
export function isFallbackEligibleTranscriptError(error: unknown): error is TranscriptAcquisitionError {
  return error instanceof TranscriptAcquisitionError && FALLBACK_ELIGIBLE_CATEGORIES.has(error.category);
}
