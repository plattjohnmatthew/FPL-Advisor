import "server-only";

import { YouTubeEpisodeDiscoveryProvider } from "./youtube-discovery";
import { ProcessingRunOrchestrator } from "./orchestrator";
import { SupabaseProcessingRepository } from "./supabase-repository";
import { createTranscriptProvider } from "@/lib/transcripts/factory";
import { OpenAIInsightExtractor } from "@/lib/insights/openai-extractor";
import { OpenAISplitDecisionDetector } from "@/lib/splits/openai-detector";
import { SupabaseSplitDecisionRepository } from "@/lib/splits/repository";
import { SplitDecisionDetectionService } from "@/lib/splits/service";
import type { ProcessingRunOptions } from "./options";

export async function startProcessingRun(options: ProcessingRunOptions) {
  const orchestrator = new ProcessingRunOrchestrator(
    new SupabaseProcessingRepository(),
    new YouTubeEpisodeDiscoveryProvider(),
    createTranscriptProvider(),
    new OpenAIInsightExtractor(),
    new SplitDecisionDetectionService(new SupabaseSplitDecisionRepository(), new OpenAISplitDecisionDetector()),
  );

  return orchestrator.run(options);
}
