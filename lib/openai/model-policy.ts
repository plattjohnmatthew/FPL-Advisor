import "server-only";

import { InvalidEnvironmentConfigurationError } from "@/lib/env";

export const OPENAI_MODEL_TASKS = ["TRANSCRIPT_EXTRACTION", "QUERY_INTERPRETATION", "SPLIT_DETECTION", "SYNTHESIS", "CHAT_ANSWER"] as const;
export type OpenAIModelTask = typeof OPENAI_MODEL_TASKS[number];
export type OpenAIUsageTask = OpenAIModelTask | "STRUCTURED_OUTPUT_REPAIR";

const POLICY: Record<OpenAIModelTask, { variable: string; recommendedDefault: string }> = {
  TRANSCRIPT_EXTRACTION: { variable: "OPENAI_EXTRACTION_MODEL", recommendedDefault: "gpt-5.6-luna" },
  QUERY_INTERPRETATION: { variable: "OPENAI_QUERY_MODEL", recommendedDefault: "gpt-5.6-luna" },
  SPLIT_DETECTION: { variable: "OPENAI_SPLIT_MODEL", recommendedDefault: "gpt-5.6-luna" },
  SYNTHESIS: { variable: "OPENAI_SYNTHESIS_MODEL", recommendedDefault: "gpt-5.4-mini" },
  CHAT_ANSWER: { variable: "OPENAI_CHAT_MODEL", recommendedDefault: "gpt-5.4-mini" },
};

function validateModel(variable: string, model: string) {
  if (!/^gpt-[a-z0-9][a-z0-9._-]*$/i.test(model)) {
    throw new InvalidEnvironmentConfigurationError(variable, "use an explicit GPT model ID such as gpt-5.6-luna");
  }
  return model;
}

export function getOpenAIModel(task: OpenAIModelTask) {
  const config = POLICY[task];
  const configured = process.env[config.variable]?.trim();
  return validateModel(config.variable, configured || config.recommendedDefault);
}

export function getRepairModel(originalModel: string) {
  return validateModel("structured-output repair model", originalModel);
}

export function getModelPolicySnapshot() {
  return Object.fromEntries(OPENAI_MODEL_TASKS.map((task) => [task, getOpenAIModel(task)])) as Record<OpenAIModelTask, string>;
}
