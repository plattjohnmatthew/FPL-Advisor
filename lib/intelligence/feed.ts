import { getAppCapabilities } from "@/lib/app-config";
import "server-only";
import { createResearchDataClient as createSupabaseServerClient } from "@/lib/research-data";
import { localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";
import { escapeLike, FEED_PAGE_SIZE, type FeedFilters } from "./filters";

export type FeedItem = { id: string; title: string; creator: string; publishedAt: string; platform: string; claimExcerpt: string | null; categories: string[]; status: string | null; insightCount: number };
export type FeedData = { items: FeedItem[]; total: number; pageCount: number; sources: { id: string; name: string; platform: string }[] };

export async function getResearchFeed(filters: FeedFilters): Promise<FeedData> {
  const db = createSupabaseServerClient();
  // The inner insight embed filters episodes via EXISTS semantics, without duplicating parent rows.
  const insightJoin = filters.category ? "insights!inner" : "insights";
  let query = db.from("episodes").select(`id,title,published_at,sources!inner(id,name,platform),${insightJoin}(id,claim,primary_category,extraction_index)`, { count: "exact" });
  if (filters.q) query = query.ilike("title", `%${escapeLike(filters.q)}%`);
  if (filters.from) query = query.gte("published_at", localDateRangeToUtcBounds(filters.from, filters.from, filters.tz).startInclusive);
  if (filters.to) query = query.lt("published_at", localDateRangeToUtcBounds(filters.to, filters.to, filters.tz).endExclusive);
  if (filters.creator) query = query.eq("source_id", filters.creator);
  if (filters.type) query = query.eq("sources.platform", filters.type);
  if (filters.category) query = query.eq("insights.primary_category", filters.category);
  const offset = (filters.page - 1) * FEED_PAGE_SIZE;
  const [episodes, sources] = await Promise.all([
    query.order("published_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + FEED_PAGE_SIZE - 1),
    db.from("sources").select("id,name,platform").order("name"),
  ]);
  if (episodes.error) throw new Error(`Unable to load research feed: ${episodes.error.message}`);
  if (sources.error) throw new Error(`Unable to load creators: ${sources.error.message}`);
  const rows = episodes.data as unknown as { id: string; title: string; published_at: string; sources: { name: string; platform: string }; insights: { id: string; claim: string; primary_category: string; extraction_index: number }[] }[];
  const attempts = rows.length ? await db.from(getAppCapabilities().mode === "private" ? "latest_episode_processing_attempts" : "public_episode_processing_states").select("episode_id,status").in("episode_id", rows.map((row) => row.id)) : { data: [], error: null };
  if (attempts.error) throw new Error(`Unable to load episode status: ${attempts.error.message}`);
  const statuses = new Map(attempts.data.map((row) => [row.episode_id as string, row.status as string]));
  return {
    items: rows.map((row) => {
      const insights = [...row.insights].sort((a, b) => a.extraction_index - b.extraction_index || a.id.localeCompare(b.id));
      const claim = insights[0]?.claim;
      const status = statuses.get(row.id) ?? (insights.length ? "COMPLETED" : "DISCOVERED");
      return { id: row.id, title: row.title, creator: row.sources.name, publishedAt: row.published_at, platform: row.sources.platform,
        claimExcerpt: claim ? `${claim.slice(0, 220)}${claim.length > 220 ? "…" : ""}` : null,
        categories: [...new Set(insights.map((item) => item.primary_category))].sort(), status: status === "COMPLETED" ? null : status, insightCount: insights.length };
    }),
    total: episodes.count ?? 0, pageCount: Math.ceil((episodes.count ?? 0) / FEED_PAGE_SIZE),
    sources: sources.data.map((source) => ({ id: source.id as string, name: source.name as string, platform: source.platform as string })),
  };
}
