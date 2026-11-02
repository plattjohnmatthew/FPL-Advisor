import "server-only";
import { executeBackgroundRun } from "./background";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseProcessingRepository } from "./supabase-repository";
import { ProcessingRunOrchestrator } from "./orchestrator";
import { YouTubeEpisodeDiscoveryProvider } from "./youtube-discovery";
import { createTranscriptProvider } from "@/lib/transcripts/factory";
import { OpenAIInsightExtractor } from "@/lib/insights/openai-extractor";
import { SplitDecisionDetectionService } from "@/lib/splits/service";
import { SupabaseSplitDecisionRepository } from "@/lib/splits/repository";
import { OpenAISplitDecisionDetector } from "@/lib/splits/openai-detector";

export type EpisodeControlAction = "PAUSE" | "RESUME" | "RETRY" | "CANCEL" | "DISMISS";

export async function controlEpisode(episodeId: string, action: EpisodeControlAction, schedule: (work: () => Promise<unknown>) => void) {
  const repository = new SupabaseProcessingRepository();
  const episode = await repository.getEpisode(episodeId);
  if (!episode) throw new Error("Episode not found.");
  if (action === "DISMISS" || action === "CANCEL") {
    const db = createSupabaseServerClient();
    const { data: attempt, error } = await db.from("latest_episode_processing_attempts")
      .select("run_id, status").eq("episode_id", episodeId).maybeSingle();
    if (error) throw new Error(`Unable to load episode attempt: ${error.message}`);
    if (!attempt) throw new Error("Episode attempt not found.");
    if (action === "DISMISS") {
      const { error: dismissError } = await db.from("run_episodes")
        .update({ failure_dismissed_at: new Date().toISOString() })
        .eq("run_id", attempt.run_id).eq("episode_id", episodeId).in("status", ["FAILED", "CANCELLED"]);
      if (dismissError) throw new Error(`Unable to dismiss failure: ${dismissError.message}`);
      return { status: "DISMISSED" as const };
    }
    const { data: run, error: runError } = await db.from("processing_runs").select("run_type").eq("id", attempt.run_id).single();
    if (runError) throw new Error(`Unable to load retry run: ${runError.message}`);
    if (run.run_type !== "MANUAL_EPISODE") throw new Error("Use Stop processing to cancel a multi-episode run.");
    await repository.requestCancellation(attempt.run_id as string);
    return { status: "CANCELLING" as const };
  }
  if (action === "PAUSE") { await repository.setEpisodePaused(episodeId, true); return { status: "PAUSE_REQUESTED" as const }; }
  await repository.setEpisodePaused(episodeId, false);
  if (await repository.isEpisodeFullyProcessed(episodeId)) throw new Error("Completed episodes are not retried automatically.");
  const history = await repository.getEpisodeAttemptHistory(episodeId);
  const runId = await repository.createManualEpisodeRun(episode);
  const orchestrator = new ProcessingRunOrchestrator(repository, new YouTubeEpisodeDiscoveryProvider(), createTranscriptProvider(repository), new OpenAIInsightExtractor(), new SplitDecisionDetectionService(new SupabaseSplitDecisionRepository(), new OpenAISplitDecisionDetector()));
  schedule(() => executeBackgroundRun(runId, () => orchestrator.runManualEpisode(runId, { episode, retryCount: history.nextRetryCount }, action === "RESUME" ? "MANUAL_RESUME" : "MANUAL_RETRY")));
  return { runId, status: "RUNNING" as const };
}
