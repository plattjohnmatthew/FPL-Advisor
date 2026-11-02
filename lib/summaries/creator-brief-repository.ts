import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreatorBriefSchema, type CreatorBrief } from "./creator-brief";
import type { SynthesisScope } from "./schema";

export type CreatorBriefCacheKey = { sourceId: string; scope: SynthesisScope; inputHash: string; promptVersion: string; model: string };
export type CreatorBriefCacheEntry = { brief: CreatorBrief; inputTokens: number | null; outputTokens: number | null };
export interface CreatorBriefCache {
  find(key: CreatorBriefCacheKey): Promise<CreatorBriefCacheEntry | null>;
  save(key: CreatorBriefCacheKey, entry: CreatorBriefCacheEntry): Promise<void>;
}

export class SupabaseCreatorBriefCache implements CreatorBriefCache {
  async find(key: CreatorBriefCacheKey) {
    let query = createSupabaseServerClient().from("creator_synthesis_briefs")
      .select("brief_data,input_tokens,output_tokens").eq("source_id", key.sourceId).eq("input_hash", key.inputHash)
      .eq("prompt_version", key.promptVersion).eq("model", key.model).eq("scope_type", key.scope.type);
    query = key.scope.type === "RUN" ? query.eq("run_id", key.scope.runId) : query.eq("from_date", key.scope.fromDate).eq("to_date", key.scope.toDate);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`Unable to load cached creator brief: ${error.message}`);
    return data ? { brief: CreatorBriefSchema.parse(data.brief_data), inputTokens: data.input_tokens as number | null, outputTokens: data.output_tokens as number | null } : null;
  }

  async save(key: CreatorBriefCacheKey, entry: CreatorBriefCacheEntry) {
    const { error } = await createSupabaseServerClient().from("creator_synthesis_briefs").upsert({
      source_id: key.sourceId, scope_type: key.scope.type, run_id: key.scope.type === "RUN" ? key.scope.runId : null,
      from_date: key.scope.type === "DATE_RANGE" ? key.scope.fromDate : null, to_date: key.scope.type === "DATE_RANGE" ? key.scope.toDate : null,
      scope_identity: key.scope.type === "RUN" ? key.scope.runId : `${key.scope.fromDate}:${key.scope.toDate}`,
      input_hash: key.inputHash, prompt_version: key.promptVersion, model: key.model, brief_data: entry.brief,
      input_tokens: entry.inputTokens, output_tokens: entry.outputTokens,
    }, { onConflict: "source_id,scope_identity,input_hash,prompt_version,model" });
    if (error) throw new Error(`Unable to cache creator brief: ${error.message}`);
  }
}
