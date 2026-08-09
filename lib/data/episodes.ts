import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Episode = {
  id: string;
  sourceId: string;
  externalEpisodeId: string;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  durationSeconds: number | null;
  gameweek: number | null;
  createdAt: string;
};

type EpisodeRow = {
  id: string;
  source_id: string;
  external_episode_id: string;
  title: string;
  source_url: string;
  published_at: string;
  duration_seconds: number | null;
  gameweek: number | null;
  created_at: string;
};

export async function listEpisodes(sourceId?: string): Promise<Episode[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("episodes")
    .select(
      "id, source_id, external_episode_id, title, source_url, published_at, duration_seconds, gameweek, created_at",
    )
    .order("published_at", { ascending: false });

  if (sourceId) {
    query = query.eq("source_id", sourceId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load episodes: ${error.message}`);
  }

  return (data as EpisodeRow[]).map((episode) => ({
    id: episode.id,
    sourceId: episode.source_id,
    externalEpisodeId: episode.external_episode_id,
    title: episode.title,
    sourceUrl: episode.source_url,
    publishedAt: episode.published_at,
    durationSeconds: episode.duration_seconds,
    gameweek: episode.gameweek,
    createdAt: episode.created_at,
  }));
}

