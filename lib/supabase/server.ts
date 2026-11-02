import "server-only";

import { getAppCapabilities } from "@/lib/app-config";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/env";

export function createSupabaseServerClient() {
  if (getAppCapabilities().mode === "public_read_only") throw new Error("PUBLIC_READ_ONLY: operational database is unavailable");
  const { url, secretKey } = getSupabaseEnvironment();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
