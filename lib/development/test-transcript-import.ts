import "server-only";

import { createHash } from "node:crypto";
import { OpenAIInsightExtractor } from "@/lib/insights/openai-extractor";
import { EXTRACTION_VERSION } from "@/lib/insights/prompt";
import type { InsightExtractor } from "@/lib/insights/extractor";
import type { StoredTranscript } from "@/lib/processing/repository";
import { SupabaseProcessingRepository } from "@/lib/processing/supabase-repository";
import type { StoredEpisode } from "@/lib/processing/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashTranscriptContent } from "@/lib/transcripts/hash";
import { ManualTranscriptProvider } from "@/lib/transcripts/manual-provider";

export type TestTranscriptImportInput = {
  sourceName: string;
  episodeTitle: string;
  publishedAt: string;
  sourceUrl: string;
  gameweek: number | null;
  rawText: string;
};

export type TestTranscriptImportResult = {
  sourceCreated: boolean;
  episodeCreated: boolean;
  transcriptCreated: boolean;
  extractionSkipped: boolean;
  insightsCreated: number;
  episodeId: string;
  transcriptId: string;
};

export interface TestTranscriptImportRepository {
  findOrCreateEpisode(input: TestTranscriptImportInput): Promise<{ episode: StoredEpisode; sourceCreated: boolean; episodeCreated: boolean }>;
  findTranscript(episodeId: string, contentHash: string): Promise<{ id: string } | null>;
  saveTranscript(episode: StoredEpisode, rawText: string, contentHash: string): Promise<{ id: string }>;
  getTranscript(episodeId: string): Promise<StoredTranscript | null>;
  countExtraction(episodeId: string, extractionVersion: string): Promise<number>;
  persistExtraction(episodeId: string, extraction: Awaited<ReturnType<InsightExtractor["extract"]>>): Promise<number>;
}

function stableDevelopmentId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export class SupabaseTestTranscriptImportRepository implements TestTranscriptImportRepository {
  private readonly processing = new SupabaseProcessingRepository();

  async findOrCreateEpisode(input: TestTranscriptImportInput) {
    const supabase = createSupabaseServerClient();
    const { data: existingSource, error: sourceLookupError } = await supabase
      .from("sources")
      .select("id")
      .eq("name", input.sourceName)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (sourceLookupError) throw new Error(`Unable to find source: ${sourceLookupError.message}`);

    let sourceId = existingSource?.id as string | undefined;
    let sourceCreated = false;
    if (!sourceId) {
      const platform = /(?:youtube\.com|youtu\.be)/i.test(input.sourceUrl) ? "YOUTUBE" : "PODCAST";
      const { data: source, error } = await supabase.from("sources").insert({
        name: input.sourceName,
        platform,
        channel_url: input.sourceUrl,
        external_channel_id: `test-${stableDevelopmentId(input.sourceName.toLowerCase())}`,
      }).select("id").single();
      if (error) throw new Error(`Unable to create source: ${error.message}`);
      sourceId = source.id as string;
      sourceCreated = true;
    }

    const externalEpisodeId = `test-${stableDevelopmentId(input.sourceUrl)}`;
    const upserted = await this.processing.upsertEpisode(sourceId, {
      externalEpisodeId,
      title: input.episodeTitle,
      sourceUrl: input.sourceUrl,
      publishedAt: input.publishedAt,
      durationSeconds: null,
      gameweek: input.gameweek,
    });
    return { episode: upserted.episode, sourceCreated, episodeCreated: upserted.created };
  }

  async findTranscript(episodeId: string, contentHash: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("transcripts")
      .select("id")
      .eq("episode_id", episodeId)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (error) throw new Error(`Unable to check transcript identity: ${error.message}`);
    return data ? { id: data.id as string } : null;
  }

  async saveTranscript(episode: StoredEpisode, rawText: string, contentHash: string) {
    const provider = new ManualTranscriptProvider(async () => ({ rawText }));
    const normalized = await provider.acquireTranscript(episode);
    return this.processing.saveTranscript(episode.id, { ...normalized, providerName: "development-file" }, contentHash);
  }

  async countExtraction(episodeId: string, extractionVersion: string) {
    const supabase = createSupabaseServerClient();
    const { count, error } = await supabase.from("episode_extractions")
      .select("id", { count: "exact", head: true })
      .eq("episode_id", episodeId)
      .eq("extraction_version", extractionVersion);
    if (error) throw new Error(`Unable to check existing extraction: ${error.message}`);
    return count ?? 0;
  }

  getTranscript(episodeId: string) {
    return this.processing.getTranscript(episodeId);
  }

  persistExtraction(episodeId: string, extraction: Awaited<ReturnType<InsightExtractor["extract"]>>) {
    return this.processing.persistExtraction(episodeId, extraction);
  }
}

export async function importTestTranscript(
  input: TestTranscriptImportInput,
  repository: TestTranscriptImportRepository = new SupabaseTestTranscriptImportRepository(),
  extractor: InsightExtractor = new OpenAIInsightExtractor(),
): Promise<TestTranscriptImportResult> {
  const rawText = input.rawText.trim();
  if (!rawText) throw new Error("Transcript file is empty.");

  const { episode, sourceCreated, episodeCreated } = await repository.findOrCreateEpisode({ ...input, rawText });
  const contentHash = hashTranscriptContent(rawText);
  const existingTranscript = await repository.findTranscript(episode.id, contentHash);
  const transcript = existingTranscript ?? await repository.saveTranscript(episode, rawText, contentHash);
  const existingInsightCount = await repository.countExtraction(episode.id, EXTRACTION_VERSION);

  if (existingInsightCount > 0) {
    return {
      sourceCreated,
      episodeCreated,
      transcriptCreated: existingTranscript === null,
      extractionSkipped: true,
      insightsCreated: 0,
      episodeId: episode.id,
      transcriptId: transcript.id,
    };
  }

  const storedTranscript = await repository.getTranscript(episode.id);
  if (!storedTranscript) throw new Error("Transcript was stored but could not be reloaded.");
  const extraction = await extractor.extract(episode, storedTranscript);
  const insightsCreated = await repository.persistExtraction(episode.id, extraction);

  return {
    sourceCreated,
    episodeCreated,
    transcriptCreated: existingTranscript === null,
    extractionSkipped: false,
    insightsCreated,
    episodeId: episode.id,
    transcriptId: transcript.id,
  };
}
