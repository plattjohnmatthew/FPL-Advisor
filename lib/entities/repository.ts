import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { aggregateByCreator, aggregateSentiment, type CreatorOpinion, type CreatorStance, type OpinionInsight } from "@/lib/opinions/aggregation";
import type { EntityRange } from "./scope";
import { matchEntities } from "./search";

export type EntitySearchResult = { id: string; type: "PLAYER" | "TEAM"; name: string; aliases: string[]; externalFplId: number | null };
export type EntityExplorerInsight = OpinionInsight & { claim: string; reasoning: string; category: string; recommendation: string; timeHorizon: string; evidenceText: string | null; timestampSeconds: number | null; episodeTitle: string; sourceUrl: string; role: string };
export type EntitySplit = { id: string; question: string; unresolvedQuestion: string | null; implication: string | null; positions: Array<{ position: string; reasoning: string; creatorNames: string[]; creatorCount: number }> };

export async function searchEntities(term: string): Promise<EntitySearchResult[]> {
  const query = term.trim().toLocaleLowerCase();
  if (query.length < 2) return [];
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("entities").select("id, type, canonical_name, aliases, external_fpl_id").order("canonical_name");
  if (error) throw new Error(`Unable to search entities: ${error.message}`);
  return matchEntities(data.map((row) => ({ id: row.id as string, type: row.type as "PLAYER" | "TEAM", canonicalName: row.canonical_name as string, aliases: (row.aliases as string[]) ?? [], externalFplId: row.external_fpl_id as number | null })), query)
    .map((row) => ({ id: row.id, type: row.type, name: row.canonicalName, aliases: row.aliases, externalFplId: row.externalFplId }));
}

export async function getEntityInsightExplorer(entityId: string, range: EntityRange) {
  const supabase = createSupabaseServerClient();
  const { data: entity, error } = await supabase.from("entities").select("id, type, canonical_name, external_fpl_id").eq("id", entityId).maybeSingle();
  if (error) throw new Error(`Unable to load entity: ${error.message}`); if (!entity) return null;
  let query = supabase.from("insight_entities").select("role, insights!inner(id, episode_id, claim, reasoning, primary_category, recommendation, time_horizon, evidence_text, timestamp_seconds, episodes!inner(id, source_id, title, published_at, source_url, sources!inner(id,name)))").eq("entity_id", entityId);
  if (range.dateFrom) query = query.gte("insights.episodes.published_at", range.dateFrom);
  if (range.dateTo) query = query.lt("insights.episodes.published_at", range.dateTo);
  const { data: links, error: linksError } = await query;
  if (linksError) throw new Error(`Unable to load entity insights: ${linksError.message}`);
  const insights: EntityExplorerInsight[] = (links ?? []).flatMap((link) => {
    const insight = Array.isArray(link.insights) ? link.insights[0] : link.insights; if (!insight) return [];
    const episode = Array.isArray(insight.episodes) ? insight.episodes[0] : insight.episodes; if (!episode) return [];
    const source = Array.isArray(episode.sources) ? episode.sources[0] : episode.sources; if (!source) return [];
    return [{ id: insight.id as string, sourceId: source.id as string, sourceName: source.name as string, episodeId: episode.id as string, episodeTitle: episode.title as string, publishedAt: episode.published_at as string, sourceUrl: episode.source_url as string, claim: insight.claim as string, reasoning: insight.reasoning as string, category: insight.primary_category as string, primaryCategory: insight.primary_category as string, recommendation: insight.recommendation as string, timeHorizon: insight.time_horizon as string, evidenceText: insight.evidence_text as string | null, timestampSeconds: insight.timestamp_seconds as number | null, role: link.role as string, entities: [{ name: entity.canonical_name as string, type: entity.type as string }] }];
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const creatorOpinions = aggregateByCreator(insights);
  const recommendationDistribution = Object.fromEntries([...new Set(insights.map((item) => item.recommendation))].sort().map((recommendation) => [recommendation, insights.filter((item) => item.recommendation === recommendation).length]));
  const splits = await loadEntitySplits(supabase, insights, range);
  return { id: entity.id as string, type: entity.type as "PLAYER" | "TEAM", name: entity.canonical_name as string, externalFplId: entity.external_fpl_id as number | null, insights, insightCount: insights.length, episodeCount: new Set(insights.map((item) => item.episodeId)).size, creatorCount: creatorOpinions.length, sentiment: aggregateSentiment(insights) as CreatorStance, creatorOpinions: creatorOpinions as CreatorOpinion[], recommendationDistribution, categoryDistribution: Object.fromEntries([...new Set(insights.map((item) => item.category))].map((category) => [category, insights.filter((item) => item.category === category).length])), splits };
}

async function loadEntitySplits(supabase: ReturnType<typeof createSupabaseServerClient>, insights: EntityExplorerInsight[], range: EntityRange): Promise<EntitySplit[]> {
  if (insights.length === 0) return [];
  const ids = insights.map((item) => item.id);
  const { data: evidence, error } = await supabase.from("split_position_insights").select("split_positions(split_decision_id)").in("insight_id", ids);
  if (error) throw new Error(`Unable to load entity split decisions: ${error.message}`);
  const decisionIds = [...new Set((evidence ?? []).flatMap((row) => { const position = Array.isArray(row.split_positions) ? row.split_positions[0] : row.split_positions; return position ? [position.split_decision_id as string] : []; }))];
  if (!decisionIds.length) return [];
  const { data: decisions, error: decisionError } = await supabase.from("split_decisions").select("id, question, unresolved_question, implication, split_positions(id, position, reasoning, split_position_insights(insight_id, insights(episodes(published_at, sources(id,name)))) )").in("id", decisionIds);
  if (decisionError) throw new Error(`Unable to load split decision positions: ${decisionError.message}`);
  return (decisions ?? []).map((decision) => ({ id: decision.id as string, question: decision.question as string, unresolvedQuestion: decision.unresolved_question as string | null, implication: decision.implication as string | null, positions: (decision.split_positions ?? []).map((position) => {
    const creators = new Map<string, string>();
    for (const item of position.split_position_insights ?? []) { const insight = Array.isArray(item.insights) ? item.insights[0] : item.insights; const episode = insight && (Array.isArray(insight.episodes) ? insight.episodes[0] : insight.episodes); const source = episode && (Array.isArray(episode.sources) ? episode.sources[0] : episode.sources); if (episode && source && (!range.dateFrom || episode.published_at >= range.dateFrom) && (!range.dateTo || episode.published_at < range.dateTo)) creators.set(source.id as string, source.name as string); }
    return { position: position.position as string, reasoning: position.reasoning as string, creatorNames: [...creators.values()].sort(), creatorCount: creators.size };
  }).filter((position) => position.creatorCount > 0) })).filter((decision) => decision.positions.length > 1);
}
