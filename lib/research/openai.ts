import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIEnvironment } from "@/lib/env";
import type { ResearchAnswerGenerator, ResearchQueryInterpreter } from "./models";
import { QUERY_INTERPRETATION_PROMPT, RESEARCH_ANSWER_PROMPT } from "./prompts";
import { ResearchAnswerSchema, ResearchQueryPlanSchema, type RetrievedEvidence, type RetrievedSplitDecision } from "./schema";
import { getOpenAIModel, getRepairModel } from "@/lib/openai/model-policy";
import { trackOpenAICall } from "@/lib/openai/usage";

export class OpenAIResearchQueryInterpreter implements ResearchQueryInterpreter {
  async interpret(question: string, context?: { requestId: string }) {
    const { apiKey } = getOpenAIEnvironment();
    const model = getOpenAIModel("QUERY_INTERPRETATION");
    const response = await trackOpenAICall({ task: "QUERY_INTERPRETATION", model, requestId: context?.requestId }, () => new OpenAI({ apiKey }).responses.parse({
      model,
      input: [
        { role: "system", content: QUERY_INTERPRETATION_PROMPT },
        { role: "user", content: `Today is ${new Date().toISOString().slice(0, 10)}.\nQuestion: ${question}` },
      ],
      text: { format: zodTextFormat(ResearchQueryPlanSchema, "fpl_research_query") },
    }));
    if (!response.output_parsed) throw new Error("OpenAI returned no validated research query plan.");
    return ResearchQueryPlanSchema.parse(response.output_parsed);
  }
}

export class OpenAIResearchAnswerGenerator implements ResearchAnswerGenerator {
  async answer(question: string, evidence: RetrievedEvidence[], splits: RetrievedSplitDecision[], repair?: { error: string; validEvidenceIds: string[] }, context?: { requestId: string; model: string; domainContext?: unknown }) {
    const { apiKey } = getOpenAIEnvironment();
    const originalModel = context?.model ?? getOpenAIModel("CHAT_ANSWER");
    const model = repair ? getRepairModel(originalModel) : originalModel;
    const task = repair ? "STRUCTURED_OUTPUT_REPAIR" as const : "CHAT_ANSWER" as const;
    const response = await trackOpenAICall({ task, model, requestId: context?.requestId }, () => new OpenAI({ apiKey }).responses.parse({
      model,
      input: [
        { role: "system", content: RESEARCH_ANSWER_PROMPT },
        { role: "user", content: JSON.stringify({ question, structuredContext: context?.domainContext ?? null, retrievedEvidence: evidence, retrievedSplitDecisions: splits, repair }) },
      ],
      text: { format: zodTextFormat(ResearchAnswerSchema, "fpl_research_answer") },
    }));
    if (!response.output_parsed) throw new Error("OpenAI returned no validated research answer.");
    return ResearchAnswerSchema.parse(response.output_parsed);
  }
}
