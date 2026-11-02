import "server-only";

import { OpenAIResearchAnswerGenerator, OpenAIResearchQueryInterpreter } from "./openai";
import { SupabaseResearchRepository } from "./repository";
import { FplResearchService } from "./service";
import { CurrentSquadContextService } from "@/lib/fpl-entry/context";
import { SupabaseResearchAnalysisStore } from "./analysis-repository";

export function createFplResearchService() {
  return new FplResearchService(
    new OpenAIResearchQueryInterpreter(), new SupabaseResearchRepository(), new OpenAIResearchAnswerGenerator(), new CurrentSquadContextService(), undefined, new SupabaseResearchAnalysisStore(),
  );
}
