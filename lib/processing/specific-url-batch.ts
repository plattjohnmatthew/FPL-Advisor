import "server-only";
import { executeBackgroundRun } from "./background";

import { parseSpecificVideoUrls } from "./youtube-url-batch";
import { YouTubeVideoResolver } from "./youtube-video-resolver";
import { SupabaseProcessingRepository } from "./supabase-repository";
import { SupabaseSourceLibraryRepository } from "@/lib/sources/repository";
import { ProcessingRunOrchestrator, type SpecificUrlBatchEntry } from "./orchestrator";
import type { ProcessingFailure } from "./types";

export class SpecificUrlBatchService {
  constructor(
    private readonly repository: SupabaseProcessingRepository,
    private readonly sourceRepository: SupabaseSourceLibraryRepository,
    private readonly videoResolver: YouTubeVideoResolver,
    private readonly orchestrator: ProcessingRunOrchestrator,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async start(input: string, schedule: (work: () => Promise<unknown>) => void) {
    const items = parseSpecificVideoUrls(input);
    if (items.length === 0) throw new Error("Paste at least one YouTube video URL.");
    const runId = await this.repository.createSpecificUrlBatchRun(items);
    schedule(() => executeBackgroundRun(runId, () => this.process(input, runId)));
    return { runId, status: "RUNNING" as const };
  }

  async process(input: string, existingRunId?: string) {
    const items = parseSpecificVideoUrls(input);
    if (items.length === 0) throw new Error("Paste at least one YouTube video URL.");
    const runId = existingRunId ?? await this.repository.createSpecificUrlBatchRun(items);
    const entries: SpecificUrlBatchEntry[] = [];
    const sources = new Set<string>();
    const errors: string[] = [];
    let episodesDiscovered = 0;
    let alreadyProcessed = 0;

    for (const item of items.filter((candidate) => candidate.status === "VALID")) {
      const videoId = item.videoId!;
      try {
        let episode = await this.repository.findEpisodeByExternalId(videoId);
        if (episode && await this.repository.isEpisodeFullyProcessed(episode.id)) {
          await this.repository.linkRunSource(runId, episode.sourceId);
          await this.repository.createCompletedRunEpisode(runId, episode.id);
          await this.repository.updateUrlBatchItem(runId, videoId, { status: "ALREADY_PROCESSED", episodeId: episode.id, errorMessage: null });
          sources.add(episode.sourceId); alreadyProcessed += 1;
          continue;
        }
        if (!episode) {
          const resolved = await this.videoResolver.resolve(videoId);
          const { source } = await this.sourceRepository.upsertYouTubeFromVideo(resolved.channel);
          const upserted = await this.repository.upsertEpisode(source.id, resolved.episode);
          episode = upserted.episode;
          if (upserted.created) episodesDiscovered += 1;
        }
        await this.repository.linkRunSource(runId, episode.sourceId);
        sources.add(episode.sourceId);
        const history = await this.repository.getEpisodeAttemptHistory(episode.id);
        entries.push({ episode, retryCount: history.nextRetryCount, videoId });
        await this.repository.updateUrlBatchItem(runId, videoId, { status: "PENDING", episodeId: episode.id, errorMessage: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : `Unable to prepare YouTube video ${videoId}.`;
        errors.push(`${videoId}: ${message}`);
        await this.repository.updateUrlBatchItem(runId, videoId, { status: "FAILED", errorMessage: message });
        const failure: ProcessingFailure = { runId, episodeId: null, stage: "SOURCE_DISCOVERY", errorMessage: message, retryable: true, occurredAt: this.now() };
        await this.repository.recordFailure(failure);
      }
    }
    await this.repository.updateUrlBatchAlreadyProcessedCount(runId, alreadyProcessed);
    const result = await this.orchestrator.runSpecificUrlBatch(runId, entries, {
      sourcesChecked: sources.size, episodesDiscovered, alreadyProcessed, errors,
    });
    return {
      ...result, submittedCount: items.length,
      eligibleCount: items.filter((item) => item.status === "VALID").length,
      duplicateCount: items.filter((item) => item.status === "DUPLICATE_IN_BATCH").length,
      invalidCount: items.filter((item) => item.status === "INVALID_URL" || item.status === "UNSUPPORTED_URL").length,
      alreadyProcessedCount: alreadyProcessed,
    };
  }
}
