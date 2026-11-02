import "server-only";

import { getFplEntryEnvironment } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class FplSelectedEntryRepository {
  async getSelectedEntryId(): Promise<number> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("fpl_selected_entry").select("entry_id").eq("singleton", true).maybeSingle();
    if (error) throw new Error(`Could not load the selected FPL entry: ${error.message}`);
    if (data) return Number(data.entry_id);
    const { entryId } = getFplEntryEnvironment();
    const { error: saveError } = await supabase.from("fpl_selected_entry").insert({ singleton: true, entry_id: entryId });
    if (saveError) throw new Error(`Could not persist the default FPL entry: ${saveError.message}`);
    return entryId;
  }

  async setSelectedEntryId(entryId: number): Promise<void> {
    if (!Number.isSafeInteger(entryId) || entryId <= 0) throw new Error("FPL entry ID must be a positive integer.");
    const { error } = await createSupabaseServerClient().from("fpl_selected_entry")
      .upsert({ singleton: true, entry_id: entryId }, { onConflict: "singleton" });
    if (error) throw new Error(`Could not save the selected FPL entry: ${error.message}`);
  }
}
