import { loadEnvConfig } from "@next/env";
import { createSupabaseServerClient } from "../lib/supabase/server";

async function main() {
  loadEnvConfig(process.cwd());
  const supabase = createSupabaseServerClient();
  const [{ data: attempts, error: attemptError }, { data: transcripts, error: transcriptError }, { data: insights, error: insightError }] = await Promise.all([
    supabase.from("run_episodes").select("run_id, episode_id, status, transcript_status, extraction_status, error_message, episodes(id, title, transcripts(id), insights(id), episode_extractions(id))"),
    supabase.from("transcripts").select("id, episode_id"),
    supabase.from("insights").select("id, episode_id"),
  ]);
  if (attemptError || transcriptError || insightError) throw new Error((attemptError ?? transcriptError ?? insightError)!.message);

  const episodeIds = new Set((attempts ?? []).map((row) => row.episode_id as string));
  const { data: allEpisodes, error: episodeError } = await supabase.from("episodes").select("id");
  if (episodeError) throw new Error(episodeError.message);
  allEpisodes.forEach((row) => episodeIds.add(row.id as string));

  const completedInconsistencies = attempts.filter((row) => {
    if (row.status !== "COMPLETED") return false;
    const episode = row.episodes as unknown as { transcripts: unknown[]; insights: unknown[]; episode_extractions: unknown[] } | null;
    return !episode || episode.transcripts.length === 0 || episode.insights.length === 0 || episode.episode_extractions.length === 0
      || row.transcript_status !== "READY" || row.extraction_status !== "COMPLETED";
  }).map((row) => ({ runId: row.run_id, episodeId: row.episode_id, status: row.status, transcriptStatus: row.transcript_status, extractionStatus: row.extraction_status, error: row.error_message }));

  const report = {
    checkedAt: new Date().toISOString(),
    completedEpisodeInconsistencies: completedInconsistencies,
    transcriptsWithMissingEpisode: transcripts.filter((row) => !episodeIds.has(row.episode_id as string)),
    insightsWithMissingEpisode: insights.filter((row) => !episodeIds.has(row.episode_id as string)),
  };
  console.log(JSON.stringify(report, null, 2));
  if (completedInconsistencies.length || report.transcriptsWithMissingEpisode.length || report.insightsWithMissingEpisode.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
