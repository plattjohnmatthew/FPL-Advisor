import { createRemoteSnapshotReader } from "./remote";
import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateSnapshot, type PublicSnapshot } from "./schema";
export const snapshotDirectory = () => join(process.cwd(), "data", "public-snapshots");
export async function writeSnapshot(snapshot: PublicSnapshot, directory = snapshotDirectory()) {
  validateSnapshot(snapshot);
  await mkdir(directory, { recursive: true });
  const serialized = JSON.stringify(snapshot);
  // Immutable content first, then one atomic pointer rename. Failed validation never touches current.
  await writeFile(join(directory, `${snapshot.id}.json`), serialized, { flag: "wx" });
  const temporary = join(directory, `current-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({ id: snapshot.id, schema_version: 1 }));
  await rename(temporary, join(directory, "current.json"));
  return Buffer.byteLength(serialized);
}
const localVersions = new Map<string, Promise<PublicSnapshot>>();
const readRemoteSnapshot = createRemoteSnapshotReader();
export async function readSnapshot(directory?: string): Promise<PublicSnapshot> {
  if (!directory && process.env.APP_MODE === "public_read_only" && process.env.PUBLIC_SNAPSHOT_BASE_URL) {
    return readRemoteSnapshot(process.env.PUBLIC_SNAPSHOT_BASE_URL);
  }
  directory ??= snapshotDirectory();
  try {
    const pointer = JSON.parse(await readFile(join(directory,"current.json"),"utf8"));
    if (typeof pointer.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(pointer.id)) throw new Error("Invalid pointer");
    const cacheKey = `${directory}:${pointer.id}`;
    let version = localVersions.get(cacheKey);
    if (!version) {
      version = (async () => {
        const serialized = await readFile(join(directory,`${pointer.id}.json`),"utf8");
        if (Buffer.byteLength(serialized) > 25 * 1024 * 1024) throw new Error("Snapshot exceeds public size limit");
        const snapshot = JSON.parse(serialized) as PublicSnapshot;
        validateSnapshot(snapshot);
        if (snapshot.id !== pointer.id) throw new Error("Snapshot identity mismatch");
        return snapshot;
      })();
      if (localVersions.size >= 4) localVersions.delete(localVersions.keys().next().value!);
      localVersions.set(cacheKey, version);
    }
    try { return await version; } catch (error) { localVersions.delete(cacheKey); throw error; }
  } catch { throw new Error("Published research is unavailable. Generate a public snapshot locally before serving this edition."); }
}
