import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Keep completed episode data and counters if preparation or finalization fails.
export async function executeBackgroundRun(runId: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Background processing failed.";
    const db = createSupabaseServerClient();
    const { error: saveError } = await db.from("processing_runs").update({
      status: "FAILED", completed_at: new Date().toISOString(), error_message: message,
    }).eq("id", runId).in("status", ["RUNNING", "CANCELLING"]);
    if (saveError) throw new Error(`Unable to finalize failed background run: ${saveError.message}`, { cause: error });
    console.error(`Processing run ${runId} failed: ${message}`);
  }
}
