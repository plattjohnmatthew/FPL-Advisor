import "server-only";

import { EnvironmentConfigurationError } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SupabaseHealth = {
  ok: boolean;
  message: string;
  missingVariables?: string[];
};

export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (error) {
      return { ok: false, message: `Supabase connection failed: ${error.message}` };
    }

    return { ok: true, message: "Supabase connection successful." };
  } catch (error) {
    if (error instanceof EnvironmentConfigurationError) {
      return {
        ok: false,
        message: error.message,
        missingVariables: error.missingVariables,
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, message: `Supabase connection failed: ${message}` };
  }
}

