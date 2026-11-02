import { requireCapability } from "@/lib/app-config";
import type { StoredEpisode } from "@/lib/processing/types";
import {
  isFallbackEligibleTranscriptError, TranscriptAcquisitionError,
  type NormalizedTranscriptResult, type TranscriptAcquisitionContext, type TranscriptProvider,
} from "./provider";
import type { TranscriptProviderCallRecorder } from "./audited-provider";

export class TranscriptProviderChain implements TranscriptProvider {
  constructor(
    private readonly primaryName: string,
    private readonly primary: TranscriptProvider,
    private readonly fallbackName: string | null,
    private readonly fallback: TranscriptProvider | null,
    private readonly recorder: TranscriptProviderCallRecorder,
  ) {}

  async acquireTranscript(episode: StoredEpisode, context?: TranscriptAcquisitionContext): Promise<NormalizedTranscriptResult> {
    requireCapability("canProcessSources");
    const primaryContext = context ? { ...context, providerRole: "PRIMARY" as const, configuredFallbackProvider: this.fallbackName } : undefined;
    try {
      return await this.primary.acquireTranscript(episode, primaryContext);
    } catch (primaryError) {
      if (!this.fallback || !this.fallbackName || !isFallbackEligibleTranscriptError(primaryError)) throw primaryError;
      await this.markFallbackSafely(episode, context, primaryError.category);
      try {
        return await this.fallback.acquireTranscript(episode, context ? {
          ...context, providerRole: "FALLBACK", fallbackReason: primaryError.category, configuredFallbackProvider: null,
        } : undefined);
      } catch (fallbackError) {
        if (fallbackError instanceof TranscriptAcquisitionError) {
          throw new TranscriptAcquisitionError(
            `${this.primaryName} failed (${primaryError.category}); ${this.fallbackName} also failed: ${fallbackError.message}`,
            fallbackError.kind,
            fallbackError.category,
          );
        }
        throw fallbackError;
      }
    }
  }

  private async markFallbackSafely(episode: StoredEpisode, context: TranscriptAcquisitionContext | undefined, reason: string) {
    try {
      await this.recorder.markTranscriptProviderFallbackUsed?.({
        provider: this.primaryName, episodeId: episode.id, processingRunId: context?.processingRunId ?? null,
        fallbackProvider: this.fallbackName!, fallbackReason: reason,
      });
    } catch (error) {
      console.error("Unable to update transcript-provider fallback audit", error);
    }
  }
}
