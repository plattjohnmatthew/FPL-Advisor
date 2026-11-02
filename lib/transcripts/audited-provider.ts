import { requireCapability } from "@/lib/app-config";
import type { StoredEpisode } from "@/lib/processing/types";
import type { NormalizedTranscriptResult, TranscriptAcquisitionContext, TranscriptProvider, TranscriptProviderAuditMetadata } from "./provider";

export type TranscriptProviderCallRecord = {
  provider: string; episodeId: string; externalEpisodeId: string; sourceId: string; processingRunId: string | null;
  trigger: string; transcriptExistedBeforeCall: boolean; success: boolean; responseStatus: number | null;
  aiFallbackAllowed: boolean; aiFallbackUsed: boolean | null; durationMs: number; retryAttemptCount: number;
  httpRequestCount: number; billableRequestCount: number | null; errorKind: string | null; errorMessage: string | null;
  startedAt: string; completedAt: string;
  providerRole: "PRIMARY" | "FALLBACK"; fallbackReason: string | null; fallbackProvider: string | null;
  errorCode: string | null; fallbackEligible: boolean;
};

export interface TranscriptProviderCallRecorder {
  recordTranscriptProviderCall(record: TranscriptProviderCallRecord): Promise<void>;
  markTranscriptProviderFallbackUsed?(record: { provider: string; episodeId: string; processingRunId: string | null; fallbackProvider: string; fallbackReason: string }): Promise<void>;
}

const emptyAudit: TranscriptProviderAuditMetadata = { responseStatus: null, aiFallbackAllowed: false, aiFallbackUsed: null, httpRequestCount: 1, retryAttemptCount: 0, billableRequestCount: null };

export class AuditedTranscriptProvider implements TranscriptProvider {
  constructor(private readonly providerName: string, private readonly inner: TranscriptProvider, private readonly recorder: TranscriptProviderCallRecorder, private readonly now = () => new Date()) {}

  async acquireTranscript(episode: StoredEpisode, context?: TranscriptAcquisitionContext): Promise<NormalizedTranscriptResult> {
    requireCapability("canProcessSources");
    const started = this.now();
    try {
      const result = await this.inner.acquireTranscript(episode, context);
      await this.recordSafely(episode, context, true, result.audit ?? emptyAudit, null, null, null, false, started);
      return result;
    } catch (error) {
      const typed = error as Error & { kind?: string; audit?: TranscriptProviderAuditMetadata };
      const category = "category" in typed && typeof typed.category === "string" ? typed.category : null;
      const fallbackEligible = category !== null && ["QUOTA_EXHAUSTED", "RATE_LIMITED", "PROVIDER_UNAVAILABLE", "REQUEST_BLOCKED"].includes(category);
      await this.recordSafely(episode, context, false, typed.audit ?? emptyAudit, typed.kind ?? null, typed.message ?? "Transcript request failed.", category, fallbackEligible, started);
      throw error;
    }
  }

  private async record(episode: StoredEpisode, context: TranscriptAcquisitionContext | undefined, success: boolean, audit: TranscriptProviderAuditMetadata, errorKind: string | null, errorMessage: string | null, errorCode: string | null, fallbackEligible: boolean, started: Date) {
    const completed = this.now();
    await this.recorder.recordTranscriptProviderCall({
      provider: this.providerName, episodeId: episode.id, externalEpisodeId: episode.externalEpisodeId, sourceId: episode.sourceId,
      processingRunId: context?.processingRunId ?? null, trigger: context?.trigger ?? "UNKNOWN", transcriptExistedBeforeCall: context?.transcriptExistedBeforeCall ?? false,
      success, responseStatus: audit.responseStatus, aiFallbackAllowed: audit.aiFallbackAllowed, aiFallbackUsed: audit.aiFallbackUsed,
      durationMs: Math.max(0, completed.getTime() - started.getTime()), retryAttemptCount: audit.retryAttemptCount,
      httpRequestCount: audit.httpRequestCount, billableRequestCount: audit.billableRequestCount, errorKind, errorMessage,
      startedAt: started.toISOString(), completedAt: completed.toISOString(),
      providerRole: context?.providerRole ?? "PRIMARY", fallbackReason: context?.fallbackReason ?? null,
      fallbackProvider: context?.configuredFallbackProvider ?? null,
      errorCode, fallbackEligible,
    });
  }

  private async recordSafely(episode: StoredEpisode, context: TranscriptAcquisitionContext | undefined, success: boolean, audit: TranscriptProviderAuditMetadata, errorKind: string | null, errorMessage: string | null, errorCode: string | null, fallbackEligible: boolean, started: Date) {
    try { await this.record(episode, context, success, audit, errorKind, errorMessage, errorCode, fallbackEligible, started); }
    catch (error) { console.error("Unable to persist transcript-provider usage audit", error); }
  }
}
