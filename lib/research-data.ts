import "server-only";
import { getAppCapabilities } from "./app-config";
import { createSupabaseServerClient } from "./supabase/server";
import { createPublicSnapshotResearchClient } from "./public-snapshot/client";
export function createResearchDataClient() {
  return getAppCapabilities().mode === "public_read_only" ? createPublicSnapshotResearchClient() : createSupabaseServerClient();
}
