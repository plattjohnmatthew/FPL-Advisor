import nextEnvironment from "@next/env";
const { loadEnvConfig } = nextEnvironment;
import { spawnSync } from "node:child_process";
import { publicBuildEnvironment } from "./public-environment.mjs";
loadEnvConfig(process.cwd());
if (process.env.VERCEL === "1" && process.env.APP_MODE !== "public_read_only") throw new Error("Set APP_MODE=public_read_only in this Vercel project's build/runtime environment before deployment");
if (process.env.VERCEL === "1" && !process.env.PUBLIC_SNAPSHOT_BASE_URL) throw new Error("Set PUBLIC_SNAPSHOT_BASE_URL before deployment so data releases are independent of code releases");
const env = publicBuildEnvironment();
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(["--import", "tsx", "--conditions=react-server", "scripts/validate-public-data.ts", "--require-clean-environment"]);
run(["node_modules/next/dist/bin/next", "build"]);
run(["--import", "tsx", "--conditions=react-server", "scripts/check-public-bundle.ts"]);
