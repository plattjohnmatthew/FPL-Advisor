import { readSnapshot } from "@/lib/public-snapshot/storage";
import { getAppCapabilities } from "@/lib/app-config";
import "server-only";
import { latestRelevantBriefing } from "@/lib/intelligence/briefing-history";
import { createResearchDataClient as createSupabaseServerClient } from "@/lib/research-data";
import { type Briefing } from "@/lib/intelligence/briefing";
import { SupabaseRunSummaryRepository } from "@/lib/summaries/repository";
import type { SummaryInsightContext } from "@/lib/summaries/schema";
import { latestSevenLocalDates } from "@/lib/dates/calendar-window";

export type OverviewPeriod = ReturnType<typeof latestSevenLocalDates>;
export type LatestCreatorEpisode = { id: string; title: string; creator: string; platform: string; publishedAt: string; claimExcerpt: string | null };
export interface OverviewRepository {
  briefing(period: OverviewPeriod): Promise<Briefing | null>;
  insights(period: OverviewPeriod): Promise<SummaryInsightContext[]>;
  latestEpisodes(): Promise<LatestCreatorEpisode[]>;
  squadEntityIds(): Promise<string[]>;
  updatedAt(): Promise<string | null>;
}

export class SupabaseOverviewRepository implements OverviewRepository {
  async briefing(period: OverviewPeriod) {
    return latestRelevantBriefing(period);
  }
  async insights(period: OverviewPeriod) {
    const context = await new SupabaseRunSummaryRepository().loadDateRangeContext(period.fromDate, period.toDate, 0);
    const included = new Set(context.includedEpisodeIds);
    return context.insights.filter((insight) => included.has(insight.episodeId));
  }
  async latestEpisodes(): Promise<LatestCreatorEpisode[]> {
    const db = createSupabaseServerClient(); const result: LatestCreatorEpisode[] = [];
    for (let from = 0; result.length < 5; from += 20) {
      const page = await db.from("episodes").select("id,title,published_at,sources!inner(name,platform),transcripts!inner(id),insights!inner(id,claim,extraction_index)")
        .order("published_at", { ascending: false }).order("id", { ascending: false }).range(from, from + 19);
      if (page.error) throw new Error("Latest creator intelligence is temporarily unavailable.");
      if (!page.data.length) break;
      const attempts = await db.from(getAppCapabilities().mode === "private" ? "latest_episode_processing_attempts" : "public_episode_processing_states").select("episode_id,status").in("episode_id", page.data.map((row) => row.id));
      if (attempts.error) throw new Error("Latest processing state is temporarily unavailable.");
      const statuses = new Map(attempts.data.map((row) => [row.episode_id as string, row.status as string]));
      for (const episode of page.data) {
        const status = statuses.get(episode.id as string);
        // Legacy manual imports can have saved insights/transcripts without a run attempt.
        if (status && status !== "COMPLETED") continue;
        const source = episode.sources as unknown as { name: string; platform: string };
        const claim = [...episode.insights].sort((a, b) => Number(a.extraction_index) - Number(b.extraction_index))[0]?.claim as string | undefined;
        result.push({ id: episode.id as string, title: episode.title as string, publishedAt: episode.published_at as string, creator: source.name, platform: source.platform,
          claimExcerpt: claim ? `${claim.slice(0, 180)}${claim.length > 180 ? "…" : ""}` : null });
        if (result.length === 5) break;
      }
      if (page.data.length < 20) break;
    }
    return result;
  }
  async squadEntityIds() {
    if (!getAppCapabilities().canViewSquad) return [];
    if (getAppCapabilities().mode === "public_read_only") {
      const snapshot=await readSnapshot(); const players=new Set(snapshot.squad?.picks.map(p=>p.fplPlayerId) ?? []);
      return snapshot.tables.entities.filter(row=>row.type==="PLAYER" && players.has(Number(row.external_fpl_id))).map(row=>String(row.id));
    }
    const db = createSupabaseServerClient();
    const selection = await db.from("fpl_selected_entry").select("entry_id").eq("singleton", true).maybeSingle();
    if (selection.error) throw new Error("Saved squad is temporarily unavailable.");
    if (!selection.data) return [];
    const snapshot = await db.from("fpl_squad_snapshots").select("id").eq("entry_id", selection.data.entry_id).order("gameweek", { ascending: false }).order("retrieved_at", { ascending: false }).limit(1).maybeSingle();
    if (snapshot.error) throw new Error("Saved squad is temporarily unavailable.");
    if (!snapshot.data) return [];
    const picks = await db.from("fpl_squad_picks").select("fpl_player_id").eq("snapshot_id", snapshot.data.id);
    if (picks.error) throw new Error("Saved squad players are temporarily unavailable.");
    if (!picks.data.length) return [];
    const entities = await db.from("entities").select("id").eq("type", "PLAYER").in("external_fpl_id", picks.data.map((pick) => pick.fpl_player_id));
    if (entities.error) throw new Error("Saved squad mappings are temporarily unavailable.");
    return entities.data.map((entity) => entity.id as string);
  }
  async updatedAt() {
    const db = createSupabaseServerClient();
    const [insight, briefing] = await Promise.all([
      db.from("insights").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("run_summaries").select("generated_at").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (insight.error || briefing.error) return null;
    return [insight.data?.created_at, briefing.data?.generated_at].filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  }
}
