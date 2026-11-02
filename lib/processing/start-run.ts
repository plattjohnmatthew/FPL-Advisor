import "server-only";
import { executeBackgroundRun } from "./background";

import { YouTubeEpisodeDiscoveryProvider } from "./youtube-discovery";
import { ProcessingRunOrchestrator } from "./orchestrator";
import { SupabaseProcessingRepository } from "./supabase-repository";
import { createTranscriptProvider } from "@/lib/transcripts/factory";
import { OpenAIInsightExtractor } from "@/lib/insights/openai-extractor";
import { OpenAISplitDecisionDetector } from "@/lib/splits/openai-detector";
import { SupabaseSplitDecisionRepository } from "@/lib/splits/repository";
import { SplitDecisionDetectionService } from "@/lib/splits/service";
import type { ProcessingRunOptions } from "./options";

export async function startProcessingRun(options: ProcessingRunOptions, schedule: (work: () => Promise<unknown>) => void) {
  const repository = new SupabaseProcessingRepository();
  const orchestrator = new ProcessingRunOrchestrator(
    repository,
    new YouTubeEpisodeDiscoveryProvider(),
    createTranscriptProvider(repository),
    new OpenAIInsightExtractor(),
    new SplitDecisionDetectionService(new SupabaseSplitDecisionRepository(), new OpenAISplitDecisionDetector()),
  );

  const runId = await repository.createRun(options, options.selectedSourceIds);
  schedule(() => executeBackgroundRun(runId, () => orchestrator.run(options, runId)));
  return { runId, status: "RUNNING" as const };
}
