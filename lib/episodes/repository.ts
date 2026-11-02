import { getAppCapabilities } from "@/lib/app-config";
import { PUBLIC_EVIDENCE_LIMIT } from "@/lib/public-request";
import "server-only";

import { createResearchDataClient as createSupabaseServerClient } from "@/lib/research-data";

export type EpisodeEntity = { id: string; type: "PLAYER" | "TEAM"; name: string; role: string };
export type EpisodeInsight = {
  id: string; claim: string; reasoning: string; category: string; recommendation: string; timeHorizon: string;
  evidenceText: string | null; timestampSeconds: number | null; entities: EpisodeEntity[];
};
export type EpisodeDetail = {
  evidenceLimited?: boolean; ingestedAt: string; platform: string; externalEpisodeId: string; durationSeconds: number | null;
  extractionMetadata: { model: string; promptVersion: string; extractedAt: string } | null;
  id: string; title: string; creator: string; publishedAt: string; sourceUrl: string;
  transcriptStatus: string; extractionStatus: string; insights: EpisodeInsight[];
};

export async function getEpisodeDetail(episodeId: string): Promise<EpisodeDetail | null> {
  const supabase = createSupabaseServerClient();
  const { data: episode, error } = await supabase.from("episodes")
    .select("id, title, published_at, source_url, created_at, external_episode_id, duration_seconds, sources(name, platform)").eq("id", episodeId).maybeSingle();
  if (error) throw new Error(`Unable to load episode: ${error.message}`);
  if (!episode) return null;

  const [{ data: transcript, error: transcriptError }, { data: extraction, error: extractionError }, { data: insights, error: insightsError }] = await Promise.all([
    supabase.from("transcripts").select("id").eq("episode_id", episodeId).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("episode_extractions").select("id,model,prompt_version,extracted_at").eq("episode_id", episodeId).order("extracted_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("insights").select("id, claim, reasoning, primary_category, recommendation, time_horizon, evidence_text, timestamp_seconds, extraction_index").eq("episode_id", episodeId).order("extraction_index"),
  ]);
  if (transcriptError) throw new Error(`Unable to load transcript state: ${transcriptError.message}`);
  if (extractionError) throw new Error(`Unable to load extraction state: ${extractionError.message}`);
  if (insightsError) throw new Error(`Unable to load episode insights: ${insightsError.message}`);
  const evidenceLimited = getAppCapabilities().mode === "public_read_only" && (insights?.length ?? 0) > PUBLIC_EVIDENCE_LIMIT;
  const boundedInsights = evidenceLimited ? insights!.slice(0, PUBLIC_EVIDENCE_LIMIT) : insights;
  const insightIds = (boundedInsights ?? []).map((item) => item.id as string);
  const links = insightIds.length ? await supabase.from("insight_entities").select("insight_id, role, entities(id, type, canonical_name)").in("insight_id", insightIds) : { data: [], error: null };
  if (links.error) throw new Error(`Unable to load insight entities: ${links.error.message}`);
  const entitiesByInsight = new Map<string, EpisodeEntity[]>();
  for (const link of links.data ?? []) {
    const entity = Array.isArray(link.entities) ? link.entities[0] : link.entities;
    if (!entity) continue;
    const current = entitiesByInsight.get(link.insight_id as string) ?? [];
    current.push({ id: entity.id as string, type: entity.type as "PLAYER" | "TEAM", name: entity.canonical_name as string, role: link.role as string });
    entitiesByInsight.set(link.insight_id as string, current);
  }
  const source = Array.isArray(episode.sources) ? episode.sources[0] : episode.sources;
  return {
    evidenceLimited, ingestedAt: episode.created_at as string, platform: source?.platform as string ?? "Unknown source type",
    externalEpisodeId: episode.external_episode_id as string, durationSeconds: episode.duration_seconds as number | null,
    extractionMetadata: extraction ? { model: extraction.model as string, promptVersion: extraction.prompt_version as string, extractedAt: extraction.extracted_at as string } : null,
    id: episode.id as string, title: episode.title as string, creator: (source?.name as string) ?? "Unknown creator",
    publishedAt: episode.published_at as string, sourceUrl: episode.source_url as string,
    transcriptStatus: transcript ? "READY" : "MISSING", extractionStatus: extraction ? "COMPLETED" : "MISSING",
    insights: (boundedInsights ?? []).map((item) => ({
      id: item.id as string, claim: item.claim as string, reasoning: item.reasoning as string,
      category: item.primary_category as string, recommendation: item.recommendation as string, timeHorizon: item.time_horizon as string,
      evidenceText: item.evidence_text as string | null, timestampSeconds: item.timestamp_seconds as number | null,
      entities: entitiesByInsight.get(item.id as string) ?? [],
    })),
  };
}

export async function getEntityExplorer(entityId: string, from?: string, to?: string) {
  const supabase = createSupabaseServerClient();
  const { data: entity, error } = await supabase.from("entities").select("id, type, canonical_name").eq("id", entityId).maybeSingle();
  if (error) throw new Error(`Unable to load entity: ${error.message}`);
  if (!entity) return null;
  const { data: links, error: linksError } = await supabase.from("insight_entities").select("role, insights(id, episode_id, claim, reasoning, primary_category, recommendation, time_horizon, evidence_text, timestamp_seconds, episodes(title, published_at, source_url, sources(name)))").eq("entity_id", entityId);
  if (linksError) throw new Error(`Unable to load entity insights: ${linksError.message}`);
  const lower = from ? `${from}T00:00:00.000Z` : null;
  const upper = to ? `${to}T23:59:59.999Z` : null;
  const insights = (links ?? []).flatMap((link) => {
    const insight = Array.isArray(link.insights) ? link.insights[0] : link.insights;
    if (!insight) return [];
    const episode = Array.isArray(insight.episodes) ? insight.episodes[0] : insight.episodes;
    if (!episode || (lower && episode.published_at < lower) || (upper && episode.published_at > upper)) return [];
    const source = Array.isArray(episode.sources) ? episode.sources[0] : episode.sources;
    return [{ ...insight, role: link.role as string, episodeTitle: episode.title as string, publishedAt: episode.published_at as string, sourceUrl: episode.source_url as string, creator: (source?.name as string) ?? "Unknown creator" }];
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { id: entity.id as string, type: entity.type as "PLAYER" | "TEAM", name: entity.canonical_name as string, insights };
}
