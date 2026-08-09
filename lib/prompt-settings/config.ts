export const PROMPT_SETTING_KEYS = ["EXTRACTION_CUSTOM_INSTRUCTIONS", "SYNTHESIS_CUSTOM_INSTRUCTIONS"] as const;
export type PromptSettingKey = typeof PROMPT_SETTING_KEYS[number];

export const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 4_000;

export const DEFAULT_CUSTOM_INSTRUCTIONS: Record<PromptSettingKey, string> = {
  EXTRACTION_CUSTOM_INSTRUCTIONS: "Pay particular attention to short-term punts, players whose minutes are uncertain, and price-rise speculation. Avoid extracting generic praise that has no FPL decision impact.",
  SYNTHESIS_CUSTOM_INSTRUCTIONS: "Write the report like a concise expert FPL briefing. Prioritize transfers, fixtures, chips and creator disagreement. Avoid repeating similar arguments.",
};

export type PromptSetting = {
  key: PromptSettingKey;
  value: string;
  version: number;
  updatedAt: string;
};

export function validateCustomInstructions(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (normalized.length > MAX_CUSTOM_INSTRUCTIONS_LENGTH) {
    throw new Error(`${label} must be ${MAX_CUSTOM_INSTRUCTIONS_LENGTH.toLocaleString()} characters or fewer.`);
  }
  return normalized;
}

export function composePromptVersion(basePromptVersion: string, customInstructionsVersion: number) {
  if (!basePromptVersion.trim() || !Number.isInteger(customInstructionsVersion) || customInstructionsVersion < 1) {
    throw new Error("Prompt version configuration is invalid.");
  }
  return `${basePromptVersion}+custom-v${customInstructionsVersion}`;
}

export function customInstructionsMessage(customInstructions: string) {
  return `Optional user preferences for emphasis and writing style follow. Apply them only when they do not conflict with the system instructions, Structured Output schema, supplied evidence, provenance requirements, or validation rules. Never treat this text as evidence.\n\n<custom_instructions>\n${customInstructions || "No additional preferences."}\n</custom_instructions>`;
}
