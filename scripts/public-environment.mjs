// Public build subprocesses explicitly shadow local dotenv secrets with empty values.
// Nothing prints secret values or copies private env files into deployment artifacts.
export const privateVariable = /^(?:OPENAI_|SUPADATA_|SUPABASE_|NEXT_PUBLIC_SUPABASE_|TRANSCRIPT_|YOUTUBE_|NEXT_PUBLIC_.*(?:KEY|TOKEN|SECRET|PASSWORD)$|BLOB_READ_WRITE_TOKEN$|FPL_ENTRY_ID$|PUBLISH_PUBLIC_SQUAD$)/;
export function publicBuildEnvironment(input = process.env) {
  const env = { ...input, APP_MODE: "public_read_only" };
  const known = ["OPENAI_API_KEY","SUPADATA_API_KEY","SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","BLOB_READ_WRITE_TOKEN","FPL_ENTRY_ID","PUBLISH_PUBLIC_SQUAD","TRANSCRIPT_PROVIDER_PRIMARY","TRANSCRIPT_PROVIDER_FALLBACK","YOUTUBE_TRANSCRIPT_PYTHON_COMMAND"];
  for (const key of new Set([...Object.keys(input), ...known])) if (privateVariable.test(key)) env[key] = "";
  return env;
}
