import assert from "node:assert/strict";
import test from "node:test";
import { SpecificUrlBatchService } from "@/lib/processing/specific-url-batch";
import type { StoredEpisode } from "@/lib/processing/types";

const stored = (videoId: string, sourceId = "source-existing"): StoredEpisode => ({ id: `episode-${videoId}`, sourceId, externalEpisodeId: videoId, title: videoId, sourceUrl: `https://youtube.com/watch?v=${videoId}`, publishedAt: "2026-08-09T00:00:00Z", durationSeconds: null, gameweek: null });

class FakeRepository {
  runs = 0; completedAttachments = 0; alreadyCount = 0; resolverEpisodes = new Map<string, StoredEpisode>();
  fullyProcessed = new Set<string>(); items = new Map<string, string>(); linkedSources = new Set<string>(); failures: unknown[] = [];
  async createSpecificUrlBatchRun(items: Array<{ videoId: string | null; status: string }>) { this.runs += 1; for (const item of items) if (item.videoId && item.status === "VALID") this.items.set(item.videoId, "VALID"); return "run-1"; }
  async findEpisodeByExternalId(videoId: string) { return this.resolverEpisodes.get(videoId) ?? null; }
  async isEpisodeFullyProcessed(episodeId: string) { return this.fullyProcessed.has(episodeId); }
  async linkRunSource(_runId: string, sourceId: string) { this.linkedSources.add(sourceId); }
  async createCompletedRunEpisode() { this.completedAttachments += 1; }
  async updateUrlBatchItem(_runId: string, videoId: string, values: { status: string }) { this.items.set(videoId, values.status); }
  async upsertEpisode(sourceId: string, episode: { externalEpisodeId: string }) { const value = stored(episode.externalEpisodeId, sourceId); this.resolverEpisodes.set(episode.externalEpisodeId, value); return { episode: value, created: true }; }
  async getEpisodeAttemptHistory() { return { completed: false, nextRetryCount: 2 }; }
  async updateUrlBatchAlreadyProcessedCount(_runId: string, count: number) { this.alreadyCount = count; }
  async recordFailure(failure: unknown) { this.failures.push(failure); }
}

class FakeSources {
  calls = 0; ids = new Map<string, string>();
  async upsertYouTubeFromVideo(channel: { externalChannelId: string }) { this.calls += 1; const existed = this.ids.has(channel.externalChannelId); const id = this.ids.get(channel.externalChannelId) ?? `source-${this.ids.size + 1}`; this.ids.set(channel.externalChannelId, id); return { source: { id }, existed }; }
}

class FakeResolver {
  calls: string[] = [];
  async resolve(videoId: string) { this.calls.push(videoId); return { channel: { externalChannelId: "UC1234567890123456789012", name: "Creator", channelUrl: "https://youtube.com/channel/UC1234567890123456789012" }, episode: { externalEpisodeId: videoId, title: videoId, sourceUrl: `https://youtube.com/watch?v=${videoId}`, publishedAt: "2026-08-09T00:00:00Z", durationSeconds: null, gameweek: null } }; }
}

class FakeOrchestrator {
  batches: Array<{ runId: string; entries: Array<{ videoId: string }> }> = [];
  async runSpecificUrlBatch(runId: string, entries: Array<{ videoId: string }>, initial: { sourcesChecked: number; episodesDiscovered: number; errors: string[] }) {
    this.batches.push({ runId, entries }); return { runId, status: initial.errors.length ? "PARTIAL" as const : "COMPLETED" as const, sourcesChecked: initial.sourcesChecked, episodesDiscovered: initial.episodesDiscovered, episodesProcessed: entries.length, episodesFailed: initial.errors.length, episodesSelected: entries.length, episodesDeferred: 0, errors: initial.errors };
  }
}

function service(repository = new FakeRepository(), sources = new FakeSources(), resolver = new FakeResolver(), orchestrator = new FakeOrchestrator()) {
  return { repository, sources, resolver, orchestrator, value: new SpecificUrlBatchService(repository as never, sources as never, resolver as never, orchestrator as never) };
}

test("five videos create one run and one prepared episode per canonical video", async () => {
  const fixture = service();
  const urls = ["abcdefghij1", "abcdefghij2", "abcdefghij3", "abcdefghij4", "abcdefghij5"].map((id) => `https://youtu.be/${id}`).join("\n");
  const result = await fixture.value.process(urls);
  assert.equal(fixture.repository.runs, 1); assert.equal(fixture.orchestrator.batches[0].entries.length, 5); assert.equal(result.submittedCount, 5);
  assert.equal(fixture.sources.ids.size, 1, "new creator is canonicalized once");
});

test("fully processed video is attached and skipped before metadata or expensive pipeline", async () => {
  const fixture = service(); const episode = stored("abcdefghijk");
  fixture.repository.resolverEpisodes.set("abcdefghijk", episode); fixture.repository.fullyProcessed.add(episode.id);
  const result = await fixture.value.process("https://youtu.be/abcdefghijk");
  assert.equal(fixture.resolver.calls.length, 0); assert.equal(fixture.orchestrator.batches[0].entries.length, 0);
  assert.equal(fixture.repository.completedAttachments, 1); assert.equal(result.alreadyProcessedCount, 1);
});

test("partially processed video resumes without metadata and keeps retry count", async () => {
  const fixture = service(); fixture.repository.resolverEpisodes.set("abcdefghijk", stored("abcdefghijk"));
  await fixture.value.process("https://youtu.be/abcdefghijk");
  assert.equal(fixture.resolver.calls.length, 0); assert.equal(fixture.orchestrator.batches[0].entries[0].videoId, "abcdefghijk");
});

test("invalid and duplicate inputs do not block valid entries or create extra episodes", async () => {
  const fixture = service();
  const result = await fixture.value.process("bad\nhttps://youtu.be/abcdefghijk\nhttps://youtube.com/watch?v=abcdefghijk");
  assert.equal(fixture.orchestrator.batches[0].entries.length, 1); assert.equal(result.invalidCount, 1); assert.equal(result.duplicateCount, 1);
});
