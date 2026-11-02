import { loadEnvConfig } from "@next/env";
import { getAppCapabilities } from "../lib/app-config";
import { readSnapshot } from "../lib/public-snapshot/storage";
import { validateSnapshot } from "../lib/public-snapshot/schema";
loadEnvConfig(process.cwd());
async function check() {
  if (getAppCapabilities().mode !== "public_read_only") throw new Error("Validation requires APP_MODE=public_read_only");
  if (process.argv.includes("--require-clean-environment") && ["OPENAI_API_KEY","SUPADATA_API_KEY","SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY","BLOB_READ_WRITE_TOKEN"].some(key => Boolean(process.env[key]))) throw new Error("Public build must not receive paid or write credentials");
  const snapshot = await readSnapshot();
  validateSnapshot(snapshot);
  console.log(`Validated public snapshot ${snapshot.id}: ${snapshot.counts.episodes} episodes, ${snapshot.counts.insights} insights`);
}
check().catch(error => { console.error(error instanceof Error ? error.message : "Snapshot validation failed"); process.exitCode = 1; });
