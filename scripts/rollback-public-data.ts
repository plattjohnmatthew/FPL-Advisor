import { publicSnapshotFiles } from "../lib/public-snapshot/transport";
import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { activateRemoteSnapshot, getPublishingEnvironment } from "../lib/public-snapshot/release";
import { fetchSnapshotVersion, snapshotDigest } from "../lib/public-snapshot/remote";
import { snapshotDirectory } from "../lib/public-snapshot/storage";
import { validateSnapshot, type PublicSnapshot } from "../lib/public-snapshot/schema";
loadEnvConfig(process.cwd());
async function rollback() {
  const id = process.argv[2];
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Usage: npm run rollback:public-data -- <retained-snapshot-id>");
  const { base } = getPublishingEnvironment();
  const serialized = await readFile(join(snapshotDirectory(), `${id}.json`), "utf8");
  const snapshot = JSON.parse(serialized) as PublicSnapshot;
  validateSnapshot(snapshot);
  if (snapshot.id !== id) throw new Error("Retained snapshot identity mismatch");
  const pointer = { id, schema_version: 1 as const, sha256: snapshotDigest(publicSnapshotFiles(snapshot).serialized) };
  await fetchSnapshotVersion(base, pointer); // Verify the old immutable object still exists before activation.
  const { put } = await import("@vercel/blob");
  await activateRemoteSnapshot(pointer, put);
  console.log(`Public snapshot rolled back to ${id}. Code deployment is unchanged.`);
}
rollback().catch(error => { console.error(error instanceof Error ? error.message : "Snapshot rollback failed"); process.exitCode = 1; });
