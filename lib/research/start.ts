import "server-only";

import { OpenAIResearchAnswerGenerator, OpenAIResearchQueryInterpreter } from "./openai";
import { SupabaseResearchRepository } from "./repository";
import { FplResearchService } from "./service";

export function createFplResearchService() {
  return new FplResearchService(
    new OpenAIResearchQueryInterpreter(), new SupabaseResearchRepository(), new OpenAIResearchAnswerGenerator(),
  );
}
