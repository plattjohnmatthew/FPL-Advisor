import assert from "node:assert/strict";
import test from "node:test";

import { FakeEpisodeDiscoveryProvider } from "../../lib/processing/discovery";
import { ProcessingRunOrchestrator } from "../../lib/processing/orchestrator";
import type { EpisodeTransition, ProcessingRepository } from "../../lib/processing/repository";
import { FakeTranscriptProvider } from "../../lib/transcripts/fake-provider";
import { SupadataTranscriptProvider } from "../../lib/transcripts/supadata-provider";
import type { NormalizedTranscriptResult } from "../../lib/transcripts/provider";
import { FakeInsightExtractor } from "../../lib/insights/fake-extractor";
import type { ExtractionResult } from "../../lib/insights/extractor";
import type {
  DiscoveredEpisode,
  EpisodeAttemptHistory,
  EpisodeProcessingStatus,
  ProcessingRunResult,
  ProcessingSource,
  SourceCheckpoint,
  StoredEpisode,
} from "../../lib/processing/types";
import type { ProcessingRunOptions } from "../../lib/processing/options";

type Attempt = {
  runId: string;
  episodeId: string;
  status: EpisodeProcessingStatus;
  retryCount: number;
};

class InMemoryProcessingRepository implements ProcessingRepository {
  readonly failures: import("../../lib/processing/types").ProcessingFailure[] = [];
  readonly cancellationRequests = new Set<string>();
  readonly sources: ProcessingSource[] = [{
    id: "source-1",
    name: "Test source",
    platform: "YOUTUBE",
    channelUrl: "https://example.com/source",
    externalChannelId: "test-source",
  }];
  readonly episodes = new Map<string, StoredEpisode>();
  readonly attempts: Attempt[] = [];
  readonly runs: ProcessingRunResult[] = [];
  readonly checkpoints = new Map<string, SourceCheckpoint>();
  readonly transcripts = new Map<string, { id: string; episodeId: string; contentHash: string; rawText: string; language: string | null; segments: unknown[] | null }>();
  readonly extractions = new Map<string, ExtractionResult>();
  readonly runOptions: ProcessingRunOptions[] = [];
  readonly runSourceIds = new Map<string, string[]>();
  private runNumber = 0;
  private episodeNumber = 0;
  persistenceFailuresRemaining = 0;

  async createRun(options: ProcessingRunOptions, selectedSourceIds?: string[]) {
    this.runOptions.push(options);
    this.runNumber += 1;
    const runId = `run-${this.runNumber}`;
    this.runSourceIds.set(runId, selectedSourceIds ?? this.sources.map((source) => source.id));
    return runId;
  }
  async requestCancellation(runId: string) { this.cancellationRequests.add(runId); return true; }
  async isCancellationRequested(runId: string) { return this.cancellationRequests.has(runId); }
  async listEnabledSources() {
    return this.sources;
  }
  async listRunSources(runId: string) { return this.sources.filter((source) => this.runSourceIds.get(runId)?.includes(source.id)); }
  async getCheckpoint(sourceId: string) {
    return this.checkpoints.get(sourceId) ?? null;
  }
  async listRetryableEpisodes(sourceId: string) {
    return [...this.episodes.values()].flatMap((episode) => {
      if (episode.sourceId !== sourceId) return [];
      const history = this.attempts.filter((attempt) => attempt.episodeId === episode.id);
      if (history.length === 0 || history.some((attempt) => attempt.status === "COMPLETED")) return [];
      return [{ ...episode, retryCount: Math.max(...history.map((attempt) => attempt.retryCount)) + 1 }];
    });
  }
  async upsertEpisode(sourceId: string, metadata: DiscoveredEpisode) {
    const key = `${sourceId}:${metadata.externalEpisodeId}`;
    const existing = this.episodes.get(key);
    if (existing) return { episode: existing, created: false };
    this.episodeNumber += 1;
    const episode = { ...metadata, id: `episode-${this.episodeNumber}`, sourceId };
    this.episodes.set(key, episode);
    return { episode, created: true };
  }
  async getEpisodeAttemptHistory(episodeId: string): Promise<EpisodeAttemptHistory> {
    const history = this.attempts.filter((attempt) => attempt.episodeId === episodeId);
    return {
      completed: history.some((attempt) => attempt.status === "COMPLETED"),
      nextRetryCount: history.length === 0
        ? 0
        : Math.max(...history.map((attempt) => attempt.retryCount)) + 1,
    };
  }
  async hasPersistedExtraction(episodeId: string) { return this.extractions.has(episodeId); }
  async getTranscript(episodeId: string) {
    return this.transcripts.get(episodeId) ?? null;
  }
  async saveTranscript(episodeId: string, _transcript: NormalizedTranscriptResult, contentHash: string) {
    const existing = this.transcripts.get(episodeId);
    if (existing) return existing;
    const stored = { id: `transcript-${this.transcripts.size + 1}`, episodeId, contentHash, rawText: _transcript.rawText, language: _transcript.language, segments: _transcript.segments ?? null };
    this.transcripts.set(episodeId, stored);
    return stored;
  }
  async persistExtraction(episodeId: string, extraction: ExtractionResult) {
    if (this.persistenceFailuresRemaining > 0) { this.persistenceFailuresRemaining -= 1; throw new Error("Database persistence failed"); }
    if (this.extractions.has(episodeId)) return 0;
    this.extractions.set(episodeId, extraction);
    return extraction.insights.length;
  }
  async createRunEpisode(runId: string, episodeId: string, retryCount: number) {
    assert.equal(this.attempts.some((attempt) => attempt.runId === runId && attempt.episodeId === episodeId), false);
    this.attempts.push({ runId, episodeId, retryCount, status: "DISCOVERED" });
  }
  async transitionRunEpisode(runId: string, episodeId: string, transition: EpisodeTransition) {
    const attempt = this.attempts.find((item) => item.runId === runId && item.episodeId === episodeId);
    assert.ok(attempt);
    assert.equal(attempt.status, transition.from);
    attempt.status = transition.to;
  }
  async updateRunProgress() {}
  async updateCheckpoint(sourceId: string, checkpoint: SourceCheckpoint) {
    this.checkpoints.set(sourceId, checkpoint);
  }
  async finishRun(result: ProcessingRunResult) {
    this.runs.push(result);
  }
  async recordFailure(failure: import("../../lib/processing/types").ProcessingFailure) {
    this.failures.push(failure);
  }
}

const episode = (id: string, day: number): DiscoveredEpisode => ({
  externalEpisodeId: id,
  title: `Episode ${id}`,
  sourceUrl: `https://example.com/${id}`,
  publishedAt: `2026-08-${day.toString().padStart(2, "0")}T12:00:00.000Z`,
  durationSeconds: 1800,
  gameweek: 1,
});

const noSplitDetection = { detectForRun: async () => 0 };
const scopedOptions = (limit = 2): ProcessingRunOptions => ({
  discoveryStart: "2026-08-01T00:00:00.000Z",
  discoveryEnd: "2026-09-01T00:00:00.000Z",
  constraints: { youtube: { maxVideosPerCreator: limit } },
});

test("scoped runs select newest unprocessed YouTube videos and drain deferred backlog later", async () => {
  const repository = new InMemoryProcessingRepository();
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [
    episode("old-outside", 1), episode("video-a", 5), episode("video-b", 6), episode("video-c", 7), episode("video-d", 8),
  ]]]));
  const options = { ...scopedOptions(2), discoveryStart: "2026-08-04T00:00:00.000Z" };
  const provider = new FakeTranscriptProvider();
  const orchestrator = new ProcessingRunOrchestrator(repository, discovery, provider, new FakeInsightExtractor(), noSplitDetection);

  const first = await orchestrator.run(options);
  assert.equal(first.episodesSelected, 2);
  assert.equal(first.episodesDeferred, 2);
  assert.deepEqual(repository.attempts.map((item) => repository.episodes.values().find((episode) => episode.id === item.episodeId)?.externalEpisodeId), ["video-d", "video-c"]);
  assert.equal(repository.transcripts.size, 2, "limit is applied before transcript acquisition");
  assert.equal(repository.checkpoints.get("source-1")?.lastSuccessfulPublishedAt, null, "scoped run does not advance past deferred content");

  const second = await orchestrator.run(options);
  assert.equal(second.episodesSelected, 2);
  assert.equal(second.episodesDeferred, 0);
  assert.equal(repository.transcripts.size, 4);
  assert.equal(repository.episodes.size, 4);
  assert.deepEqual(repository.runOptions, [options, options]);
});

test("YouTube limit is per creator and does not constrain a non-video source", async () => {
  const repository = new InMemoryProcessingRepository();
  repository.sources.push(
    { id: "source-2", name: "Second video creator", platform: "YOUTUBE", channelUrl: "https://example.com/2", externalChannelId: "two" },
    { id: "source-3", name: "Podcast", platform: "PODCAST", channelUrl: "https://example.com/3", externalChannelId: "three" },
  );
  const catalog = new Map(repository.sources.map((source) => [source.id, [episode(`${source.id}-a`, 5), episode(`${source.id}-b`, 6), episode(`${source.id}-c`, 7)]]));
  const result = await new ProcessingRunOrchestrator(repository, new FakeEpisodeDiscoveryProvider(catalog), new FakeTranscriptProvider(), new FakeInsightExtractor(), noSplitDetection).run(scopedOptions(1));
  assert.equal(result.episodesSelected, 5);
  assert.equal(result.episodesDeferred, 4);
  assert.equal(repository.attempts.length, 5);
});

test("a run discovers only its snapshotted selected sources", async () => {
  const repository = new InMemoryProcessingRepository();
  repository.sources.push({ id: "source-2", name: "Unselected", platform: "YOUTUBE", channelUrl: "https://example.com/2", externalChannelId: "two" });
  const calls: string[] = [];
  const discovery = { discoverEpisodes: async (source: ProcessingSource) => { calls.push(source.id); return [episode(`${source.id}-episode`, 8)]; } };
  const options = { ...scopedOptions(2), selectedSourceIds: ["source-1"] };
  const result = await new ProcessingRunOrchestrator(repository, discovery, new FakeTranscriptProvider(), new FakeInsightExtractor(), noSplitDetection).run(options);
  assert.deepEqual(calls, ["source-1"]);
  assert.equal(result.sourcesChecked, 1);
  assert.deepEqual(repository.runSourceIds.get("run-1"), ["source-1"]);
});

test("partial run retries failures without duplicating completed or discovered episodes", async () => {
  const repository = new InMemoryProcessingRepository();
  const catalog = new Map([["source-1", [episode("test-source-A", 10), episode("test-source-B", 11), episode("test-source-C", 12), episode("test-source-D", 13)]]]);
  const discovery = new FakeEpisodeDiscoveryProvider(catalog);
  const provider = new FakeTranscriptProvider(new Set(["test-source-C"]));
  const extractor = new FakeInsightExtractor();
  const now = () => "2026-08-20T12:00:00.000Z";

  const runOne = await new ProcessingRunOrchestrator(repository, discovery, provider, extractor, noSplitDetection, now).run();

  assert.equal(runOne.status, "PARTIAL");
  assert.equal(runOne.episodesDiscovered, 3);
  assert.equal(runOne.episodesProcessed, 2);
  assert.equal(runOne.episodesFailed, 1);
  assert.deepEqual(
    repository.attempts.filter((attempt) => attempt.runId === "run-1").map((attempt) => attempt.status),
    ["FAILED", "COMPLETED", "COMPLETED"],
  );
  assert.equal(repository.checkpoints.get("source-1")?.lastSuccessfulEpisodeExternalId, "test-source-B");

  const runTwo = await new ProcessingRunOrchestrator(repository, discovery, provider, extractor, noSplitDetection, now).run();

  assert.equal(runTwo.status, "COMPLETED");
  assert.equal(runTwo.episodesDiscovered, 1);
  assert.equal(runTwo.episodesProcessed, 2);
  assert.equal(runTwo.episodesFailed, 0);
  assert.deepEqual(
    [...repository.episodes.values()].map((item) => item.externalEpisodeId).sort(),
    ["test-source-A", "test-source-B", "test-source-C", "test-source-D"],
  );
  assert.equal(repository.episodes.size, 4);
  assert.equal(repository.transcripts.size, 4);
  assert.equal(repository.attempts.filter((attempt) => attempt.episodeId === "episode-1").length, 1);
  assert.equal(repository.attempts.filter((attempt) => attempt.episodeId === "episode-2").length, 1);
  assert.deepEqual(
    repository.attempts.filter((attempt) => attempt.episodeId === "episode-3").map((attempt) => attempt.retryCount),
    [0, 1],
  );
  assert.equal(repository.checkpoints.get("source-1")?.lastSuccessfulEpisodeExternalId, "test-source-D");

  const runThree = await new ProcessingRunOrchestrator(repository, discovery, provider, extractor, noSplitDetection, now).run();
  assert.equal(runThree.episodesProcessed, 0);
  assert.equal(repository.transcripts.size, 4);
});

test("duplicate discovery entries are processed once", async () => {
  const repository = new InMemoryProcessingRepository();
  const duplicateA = episode("test-source-A", 10);
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [duplicateA, duplicateA]]]));
  const provider = new FakeTranscriptProvider();
  const extractor = new FakeInsightExtractor();

  const result = await new ProcessingRunOrchestrator(repository, discovery, provider, extractor, noSplitDetection).run();

  assert.equal(result.status, "COMPLETED");
  assert.equal(repository.episodes.size, 1);
  assert.equal(repository.attempts.length, 1);
});

test("failed or malformed extraction stores no insights and remains retryable", async () => {
  const repository = new InMemoryProcessingRepository();
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [episode("test-source-A", 10)]]]));
  const provider = new FakeTranscriptProvider();
  const malformedExtractor = { extract: async () => { throw new Error("Structured extraction validation failed"); } };

  const first = await new ProcessingRunOrchestrator(repository, discovery, provider, malformedExtractor, noSplitDetection).run();
  assert.equal(first.status, "FAILED");
  assert.equal(repository.extractions.size, 0);
  assert.equal(repository.attempts[0].status, "FAILED");
  assert.equal(repository.failures[0].stage, "EXTRACTION");
  assert.equal(repository.failures[0].retryable, false);

  const second = await new ProcessingRunOrchestrator(repository, discovery, provider, new FakeInsightExtractor(), noSplitDetection).run();
  assert.equal(second.status, "COMPLETED");
  assert.equal(repository.attempts[1].retryCount, 1);
  assert.equal(repository.extractions.size, 1);
  assert.equal(repository.transcripts.size, 1, "stored transcript is reused on retry");
  assert.equal(provider.getAttemptCount("test-source-A"), 1, "extraction retry makes no second provider call");
});

test("insight persistence retry reuses the stored transcript and makes no second provider call", async () => {
  const repository = new InMemoryProcessingRepository(); repository.persistenceFailuresRemaining = 1;
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [episode("test-source-A", 10)]]]));
  const provider = new FakeTranscriptProvider();
  const first = await new ProcessingRunOrchestrator(repository, discovery, provider, new FakeInsightExtractor(), noSplitDetection).run();
  assert.equal(first.status, "FAILED"); assert.equal(repository.transcripts.size, 1); assert.equal(repository.extractions.size, 0);
  const second = await new ProcessingRunOrchestrator(repository, discovery, provider, new FakeInsightExtractor(), noSplitDetection).run();
  assert.equal(second.status, "COMPLETED"); assert.equal(provider.getAttemptCount("test-source-A"), 1);
});

test("one malformed extraction is isolated while other episodes complete", async () => {
  const repository = new InMemoryProcessingRepository();
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [episode("good-episode", 10), episode("bad-episode", 11)]]]));
  const valid = new FakeInsightExtractor();
  const extractor = { extract: async (currentEpisode: StoredEpisode) => {
    if (currentEpisode.externalEpisodeId === "bad-episode") {
      throw new Error("Extraction validation failed: episode=bad insight=0 field=entities expected=array received=object");
    }
    return valid.extract();
  } };
  const result = await new ProcessingRunOrchestrator(repository, discovery, new FakeTranscriptProvider(), extractor, noSplitDetection).run();
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.episodesFailed, 1);
  assert.equal(result.episodesProcessed, 1);
  assert.equal(repository.extractions.size, 1);
  assert.equal(repository.failures[0].retryable, false);
});

test("split detection failure makes the run partial and is retried even when episodes are already complete", async () => {
  const repository = new InMemoryProcessingRepository();
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [episode("test-source-A", 10)]]]));
  const provider = new FakeTranscriptProvider();
  const extractor = new FakeInsightExtractor();
  let attempts = 0;
  const splitDetector = { detectForRun: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("Temporary split detection failure");
    return 1;
  } };

  const first = await new ProcessingRunOrchestrator(repository, discovery, provider, extractor, splitDetector).run();
  assert.equal(first.status, "PARTIAL");
  assert.match(first.errors[0], /Temporary split detection failure/);
  assert.equal(repository.failures[0].stage, "SPLIT_DECISION_GENERATION");

  const second = await new ProcessingRunOrchestrator(repository, discovery, provider, extractor, splitDetector).run();
  assert.equal(second.episodesProcessed, 0);
  assert.equal(second.status, "COMPLETED");
  assert.equal(attempts, 2);
});

test("discarded split candidates are recorded as warnings without making completed episodes partial", async () => {
  const repository = new InMemoryProcessingRepository();
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [episode("test-source-A", 10)]]]));
  const splitDetector = { detectForRun: async () => ({ persistedCount: 0, warnings: ["Discarded split candidate 1: overlapping evidence"] }) };
  const result = await new ProcessingRunOrchestrator(
    repository, discovery, new FakeTranscriptProvider(), new FakeInsightExtractor(), splitDetector,
  ).run();
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.episodesProcessed, 1);
  assert.equal(repository.failures.at(-1)?.stage, "SPLIT_DECISION_GENERATION");
  assert.match(repository.failures.at(-1)?.errorMessage ?? "", /overlapping evidence/);
});

test("one source discovery failure is logged without preventing later sources from being checked", async () => {
  const repository = new InMemoryProcessingRepository();
  repository.sources.push({
    id: "source-2", name: "Healthy source", platform: "YOUTUBE",
    channelUrl: "https://example.com/healthy", externalChannelId: "healthy-source",
  });
  const discovery = { discoverEpisodes: async (source: ProcessingSource) => {
    if (source.id === "source-1") throw new Error("Feed unavailable");
    return [];
  } };
  const result = await new ProcessingRunOrchestrator(
    repository, discovery, new FakeTranscriptProvider(), new FakeInsightExtractor(), noSplitDetection,
  ).run();
  assert.equal(result.sourcesChecked, 2);
  assert.equal(result.status, "FAILED");
  assert.match(result.errors[0], /Test source: Feed unavailable/);
  assert.equal(repository.checkpoints.has("source-2"), true);
});

test("an existing stored transcript prevents another Supadata request", async () => {
  const repository = new InMemoryProcessingRepository();
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [episode("test-source-A", 10)]]]));
  let requests = 0;
  const provider = new SupadataTranscriptProvider("secret", {
    fetcher: async () => { requests += 1; return new Response(JSON.stringify({ content: "Stored once", lang: "en" })); },
    sleep: async () => {},
  });
  const orchestrator = new ProcessingRunOrchestrator(repository, discovery, provider, new FakeInsightExtractor(), noSplitDetection);
  assert.equal((await orchestrator.run()).status, "COMPLETED");
  assert.equal((await orchestrator.run()).episodesProcessed, 0);
  assert.equal(requests, 1);
  assert.equal(repository.transcripts.size, 1);
});

test("one Supadata transcript failure does not stop later episodes", async () => {
  const repository = new InMemoryProcessingRepository();
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [episode("test-source-A", 10), episode("test-source-B", 11)]]]));
  const provider = new SupadataTranscriptProvider("secret", {
    fetcher: async (input) => String(input).includes("test-source-A")
      ? new Response(JSON.stringify({ message: "Video is private" }), { status: 404 })
      : new Response(JSON.stringify({ content: "Second episode transcript", lang: "en" })),
    sleep: async () => {},
  });
  const result = await new ProcessingRunOrchestrator(
    repository, discovery, provider, new FakeInsightExtractor(), noSplitDetection,
  ).run();
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.episodesFailed, 1);
  assert.equal(result.episodesProcessed, 1);
  assert.deepEqual(repository.attempts.map((attempt) => attempt.status), ["COMPLETED", "FAILED"]);
  assert.match(result.errors[0], /Video is private/);
  assert.equal(repository.failures[0].stage, "TRANSCRIPT_ACQUISITION");
  assert.equal(repository.failures[0].retryable, false);
});

test("cooperative cancellation preserves completed work and starts no later episodes", async () => {
  const repository = new InMemoryProcessingRepository();
  const discovery = new FakeEpisodeDiscoveryProvider(new Map([["source-1", [episode("test-source-A", 10), episode("test-source-B", 11), episode("test-source-C", 12)]]]));
  const baseExtractor = new FakeInsightExtractor();
  let extractionCalls = 0;
  let splitCalls = 0;
  const extractor = { extract: async (...args: Parameters<FakeInsightExtractor["extract"]>) => {
    extractionCalls += 1;
    const result = await baseExtractor.extract(...args);
    if (extractionCalls === 1) await repository.requestCancellation("run-1");
    return result;
  } };
  const splitDetector = { detectForRun: async () => { splitCalls += 1; return 0; } };
  const first = await new ProcessingRunOrchestrator(repository, discovery, new FakeTranscriptProvider(), extractor, splitDetector).run(scopedOptions(3));
  assert.equal(first.status, "CANCELLED");
  assert.equal(first.episodesProcessed, 1);
  assert.equal(repository.transcripts.size, 1);
  assert.equal(repository.extractions.size, 1);
  assert.deepEqual(repository.attempts.map((attempt) => attempt.status), ["COMPLETED", "CANCELLED", "CANCELLED"]);
  assert.equal(splitCalls, 0);

  const second = await new ProcessingRunOrchestrator(repository, discovery, new FakeTranscriptProvider(), baseExtractor, splitDetector).run(scopedOptions(3));
  assert.equal(second.status, "COMPLETED");
  assert.equal(repository.episodes.size, 3);
  assert.equal(repository.transcripts.size, 3);
  assert.equal(repository.attempts.filter((attempt) => attempt.episodeId === "episode-3").length, 1);
});


test("manual retry cancellation during transcript acquisition keeps transcript and skips extraction", async () => {
  const repository = new InMemoryProcessingRepository();
  const stored = await repository.upsertEpisode("source-1", episode("retry-cancel", 10));
  let calls = 0;
  const base = new FakeTranscriptProvider();
  const provider = { acquireTranscript: async (...args: Parameters<FakeTranscriptProvider["acquireTranscript"]>) => {
    const result = await base.acquireTranscript(...args);
    await repository.requestCancellation("manual-run");
    return result;
  } };
  const extractor = { extract: async () => { calls++; throw new Error("Must not extract"); } };
  const orchestrator = new ProcessingRunOrchestrator(repository, new FakeEpisodeDiscoveryProvider(new Map()), provider, extractor, { detectForRun: async () => 0 });
  const result = await orchestrator.runManualEpisode("manual-run", { episode: stored.episode, retryCount: 1 });
  assert.equal(result.status, "CANCELLED");
  assert.equal(repository.attempts[0].status, "CANCELLED");
  assert.equal(repository.transcripts.size, 1);
  assert.equal(calls, 0);
});

test("manual cancellation during extraction safely persists output and cancels run", async () => {
  const repository = new InMemoryProcessingRepository();
  const stored = await repository.upsertEpisode("source-1", episode("retry-extract-cancel", 10));
  const base = new FakeInsightExtractor();
  const extractor = { extract: async (...args: Parameters<FakeInsightExtractor["extract"]>) => {
    const result = await base.extract(...args);
    await repository.requestCancellation("manual-run");
    return result;
  } };
  const orchestrator = new ProcessingRunOrchestrator(repository, new FakeEpisodeDiscoveryProvider(new Map()), new FakeTranscriptProvider(), extractor, { detectForRun: async () => 0 });
  const result = await orchestrator.runManualEpisode("manual-run", { episode: stored.episode, retryCount: 1 });
  assert.equal(result.status, "CANCELLED");
  assert.equal(repository.attempts[0].status, "COMPLETED");
  assert.equal(repository.extractions.size, 1);
});
