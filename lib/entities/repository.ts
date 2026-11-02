import { getAppCapabilities } from "@/lib/app-config";
import { PUBLIC_EVIDENCE_LIMIT } from "@/lib/public-request";
import "server-only";
import { createResearchDataClient as createSupabaseServerClient } from "@/lib/research-data";
import { aggregateByCreator, aggregateSentiment, type CreatorOpinion, type CreatorStance, type OpinionInsight } from "@/lib/opinions/aggregation";
import type { EntityRange } from "./scope";
import { matchEntities } from "./search";
import { getPlayerPriceMovement } from "@/lib/fpl/repository";
import { collectDatabasePages } from "@/lib/supabase/pagination";

export type EntitySearchResult = { id: string; type: "PLAYER" | "TEAM"; name: string; aliases: string[]; externalFplId: number | null; club?: string; position?: string };
export type EntityExplorerInsight = OpinionInsight & { claim: string; reasoning: string; category: string; recommendation: string; timeHorizon: string; evidenceText: string | null; timestampSeconds: number | null; episodeTitle: string; sourceUrl: string; role: string };
export type EntitySplit = { id: string; question: string; unresolvedQuestion: string | null; implication: string | null; positions: Array<{ position: string; reasoning: string; creatorNames: string[]; creatorCount: number; insightIds: string[] }> };

export async function searchEntities(term: string): Promise<EntitySearchResult[]> {
  const query = term.trim().toLocaleLowerCase();
  if (query.length < 2 && !/^\d+$/.test(query)) return [];
  const supabase = createSupabaseServerClient();
  const [data, players, teams] = await Promise.all([
    collectDatabasePages((from, to) => supabase.from("entities").select("id,type,canonical_name,aliases,external_fpl_id").order("id").range(from, to), "Unable to search entities"),
    collectDatabasePages((from, to) => supabase.from("fpl_players").select("fpl_player_id,first_name,second_name,web_name,fpl_team_id,position").order("fpl_player_id").range(from, to), "Unable to search players"),
    collectDatabasePages((from, to) => supabase.from("fpl_teams").select("fpl_team_id,name,short_name").order("fpl_team_id").range(from, to), "Unable to search clubs"),
  ]);
  const enriched = data.map((row) => {
    const player = row.type === "PLAYER" ? players.find((item) => item.fpl_player_id === row.external_fpl_id) : undefined;
    const team = teams.find((item) => item.fpl_team_id === (player?.fpl_team_id ?? (row.type === "TEAM" ? row.external_fpl_id : null)));
    return { id: row.id as string, type: row.type as "PLAYER" | "TEAM", canonicalName: row.canonical_name as string, aliases: (row.aliases as string[]) ?? [], externalFplId: row.external_fpl_id as number | null, club: team?.name, fullName: player ? `${player.first_name} ${player.second_name}` : undefined, displayName: player?.web_name ?? team?.short_name, position: player?.position };
  });
  return ["PLAYER", "TEAM"].flatMap((type) => matchEntities(enriched.filter((row) => row.type === type), query, 10)).map((row) => ({ id: row.id, type: row.type, name: row.canonicalName, aliases: row.aliases, externalFplId: row.externalFplId, club: row.club, position: enriched.find((item) => item.id === row.id)?.position }));
}

export async function getEntityInsightExplorer(entityId: string, range: EntityRange) {
  const supabase = createSupabaseServerClient();
  const { data: entity, error } = await supabase.from("entities").select("id, type, canonical_name, external_fpl_id").eq("id", entityId).maybeSingle();
  if (error) throw new Error(`Unable to load entity: ${error.message}`); if (!entity) return null;
  let fplMetadata: Record<string, unknown> | null = null;
  if (entity.external_fpl_id != null && entity.type === "PLAYER") { const [{ data, error: fplError }, priceMovement] = await Promise.all([supabase.from("fpl_players").select("fpl_player_id, canonical_name, web_name, position, current_price, event_price_change, start_price_change, transfers_in, transfers_out, transfers_in_event, transfers_out_event, status, updated_at, fpl_team_id, fpl_teams(name,short_name)").eq("fpl_player_id", entity.external_fpl_id).maybeSingle(), getPlayerPriceMovement(Number(entity.external_fpl_id))]); if (fplError) throw new Error(`Unable to load current FPL player metadata: ${fplError.message}`); fplMetadata = data ? { ...data, priceMovement } : null; }
  if (entity.external_fpl_id != null && entity.type === "TEAM") { const { data, error: fplError } = await supabase.from("fpl_teams").select("fpl_team_id,name,short_name,code,updated_at").eq("fpl_team_id", entity.external_fpl_id).maybeSingle(); if (fplError) throw new Error(`Unable to load current FPL team metadata: ${fplError.message}`); fplMetadata = data; }
  let query = supabase.from("insight_entities").select("role, insights!inner(id, episode_id, claim, reasoning, primary_category, recommendation, time_horizon, evidence_text, timestamp_seconds, episodes!inner(id, source_id, title, published_at, source_url, sources!inner(id,name)))").eq("entity_id", entityId);
  if (range.dateFrom) query = query.gte("insights.episodes.published_at", range.dateFrom);
  if (range.dateTo) query = query.lt("insights.episodes.published_at", range.dateTo);
  const { data: links, error: linksError } = await query;
  if (linksError) throw new Error(`Unable to load entity insights: ${linksError.message}`);
  const allInsights: EntityExplorerInsight[] = (links ?? []).flatMap((link) => {
    const insight = Array.isArray(link.insights) ? link.insights[0] : link.insights; if (!insight) return [];
    const episode = Array.isArray(insight.episodes) ? insight.episodes[0] : insight.episodes; if (!episode) return [];
    const source = Array.isArray(episode.sources) ? episode.sources[0] : episode.sources; if (!source) return [];
    return [{ id: insight.id as string, sourceId: source.id as string, sourceName: source.name as string, episodeId: episode.id as string, episodeTitle: episode.title as string, publishedAt: episode.published_at as string, sourceUrl: episode.source_url as string, claim: insight.claim as string, reasoning: insight.reasoning as string, category: insight.primary_category as string, primaryCategory: insight.primary_category as string, recommendation: insight.recommendation as string, timeHorizon: insight.time_horizon as string, evidenceText: insight.evidence_text as string | null, timestampSeconds: insight.timestamp_seconds as number | null, role: link.role as string, entities: [{ name: entity.canonical_name as string, type: entity.type as string }] }];
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const evidenceLimited = getAppCapabilities().mode === "public_read_only" && allInsights.length > PUBLIC_EVIDENCE_LIMIT;
  const insights = evidenceLimited ? allInsights.slice(0, PUBLIC_EVIDENCE_LIMIT) : allInsights;
  const creatorOpinions = aggregateByCreator(insights);
  const recommendationDistribution = Object.fromEntries([...new Set(insights.map((item) => item.recommendation))].sort().map((recommendation) => [recommendation, insights.filter((item) => item.recommendation === recommendation).length]));
  const splits = await loadEntitySplits(supabase, insights, range);
  return { evidenceLimited, id: entity.id as string, type: entity.type as "PLAYER" | "TEAM", name: entity.canonical_name as string, externalFplId: entity.external_fpl_id as number | null, fplMetadata, insights, insightCount: insights.length, episodeCount: new Set(insights.map((item) => item.episodeId)).size, creatorCount: creatorOpinions.length, sentiment: aggregateSentiment(insights) as CreatorStance, creatorOpinions: creatorOpinions as CreatorOpinion[], recommendationDistribution, categoryDistribution: Object.fromEntries([...new Set(insights.map((item) => item.category))].map((category) => [category, insights.filter((item) => item.category === category).length])), splits };
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
    return { position: position.position as string, reasoning: position.reasoning as string, creatorNames: [...creators.values()].sort(), creatorCount: creators.size, insightIds: (position.split_position_insights ?? []).map((item) => item.insight_id as string).filter((id) => ids.includes(id)) };
  }).filter((position) => position.creatorCount > 0) })).filter((decision) => decision.positions.length > 1);
}
