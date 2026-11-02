import { assertPublicText } from "./public-secrets.mjs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory,entry.name)) : [join(directory,entry.name)]))).flat();
}
export async function checkPublicBundle(directory: string) {
  const candidates = (await files(directory)).filter(file => /\.(?:js|map|json)$/.test(file));
  if (!candidates.length) throw new Error("No browser build artifacts found");
  const knownSecrets = Object.entries(process.env).filter(([key,value]) => /(?:KEY|TOKEN|SECRET|PASSWORD)$/.test(key) && value && value.length >= 20).map(([,value]) => value!);
  for (const file of candidates) {
    const body = await readFile(file,"utf8");
    try { assertPublicText(body,knownSecrets); } catch { throw new Error(`Credential/private material found in browser artifact: ${file}`); }
  }
  return candidates.length;
}
if (process.argv[1]?.endsWith("check-public-bundle.ts")) {
  checkPublicBundle(join(process.cwd(),process.env.FPL_NEXT_DIST_DIR || ".next","static")).then(count => console.log(`Public browser bundle scan passed: ${count} artifacts`)).catch(error => { console.error(error.message);process.exitCode=1; });
}
