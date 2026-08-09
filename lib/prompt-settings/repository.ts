import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  PROMPT_SETTING_KEYS,
  type PromptSetting,
  type PromptSettingKey,
} from "./config";

function mapSetting(row: Record<string, unknown>): PromptSetting {
  return {
    key: row.key as PromptSettingKey,
    value: row.value as string,
    version: Number(row.version),
    updatedAt: row.updated_at as string,
  };
}

export class SupabasePromptSettingsRepository {
  async getAll(): Promise<Record<PromptSettingKey, PromptSetting>> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("app_settings").select("key, value, version, updated_at").in("key", [...PROMPT_SETTING_KEYS]);
    if (error) throw new Error(`Unable to load AI instructions: ${error.message}`);
    const byKey = new Map(data.map((row) => [row.key as PromptSettingKey, mapSetting(row)]));
    for (const key of PROMPT_SETTING_KEYS) {
      if (!byKey.has(key)) throw new Error(`AI instruction setting ${key} is missing. Apply the latest database migration.`);
    }
    return Object.fromEntries(PROMPT_SETTING_KEYS.map((key) => [key, byKey.get(key)!])) as Record<PromptSettingKey, PromptSetting>;
  }

  async get(key: PromptSettingKey) {
    return (await this.getAll())[key];
  }

  async save(extractionInstructions: string, synthesisInstructions: string) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("save_ai_instruction_settings", {
      target_extraction_instructions: extractionInstructions,
      target_synthesis_instructions: synthesisInstructions,
    });
    if (error) throw new Error(`Unable to save AI instructions: ${error.message}`);
    return this.getAll();
  }

  async reset() {
    return this.save(
      DEFAULT_CUSTOM_INSTRUCTIONS.EXTRACTION_CUSTOM_INSTRUCTIONS,
      DEFAULT_CUSTOM_INSTRUCTIONS.SYNTHESIS_CUSTOM_INSTRUCTIONS,
    );
  }
}
