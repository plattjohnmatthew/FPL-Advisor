import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/env";

export function createSupabaseServerClient() {
  const { url, secretKey } = getSupabaseEnvironment();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
