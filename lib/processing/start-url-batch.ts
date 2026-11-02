import "server-only";

import { SupabaseProcessingRepository } from "./supabase-repository";
import { SupabaseSourceLibraryRepository } from "@/lib/sources/repository";
import { YouTubeVideoResolver } from "./youtube-video-resolver";
import { ProcessingRunOrchestrator } from "./orchestrator";
import { YouTubeEpisodeDiscoveryProvider } from "./youtube-discovery";
import { createTranscriptProvider } from "@/lib/transcripts/factory";
import { OpenAIInsightExtractor } from "@/lib/insights/openai-extractor";
import { SplitDecisionDetectionService } from "@/lib/splits/service";
import { SupabaseSplitDecisionRepository } from "@/lib/splits/repository";
import { OpenAISplitDecisionDetector } from "@/lib/splits/openai-detector";
import { SpecificUrlBatchService } from "./specific-url-batch";

export function createSpecificUrlBatchService() {
  const repository = new SupabaseProcessingRepository();
  return new SpecificUrlBatchService(
    repository,
    new SupabaseSourceLibraryRepository(),
    new YouTubeVideoResolver(),
    new ProcessingRunOrchestrator(
      repository, new YouTubeEpisodeDiscoveryProvider(), createTranscriptProvider(repository), new OpenAIInsightExtractor(),
      new SplitDecisionDetectionService(new SupabaseSplitDecisionRepository(), new OpenAISplitDecisionDetector()),
    ),
  );
}
