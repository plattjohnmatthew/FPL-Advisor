import "server-only";

import { OpenAIRunSummaryGenerator } from "./openai-generator";
import { SupabaseRunSummaryRepository } from "./repository";
import { RunSummarySynthesisService } from "./service";

export function createSynthesisService() {
  return new RunSummarySynthesisService(new SupabaseRunSummaryRepository(), new OpenAIRunSummaryGenerator());
}
