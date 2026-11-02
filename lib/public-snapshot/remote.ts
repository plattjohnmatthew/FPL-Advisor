import { assembleSnapshot, boundedText, validateManifest, MAX_SNAPSHOT_BYTES } from "./transport";
import "server-only";
import { createHash } from "node:crypto";
import { validateSnapshot, type PublicSnapshot } from "./schema";
export type SnapshotPointer = { schema_version: 1; id: string; sha256: string };
export function snapshotBaseUrl(raw: string): URL {
  if (!raw.trim()) throw new Error("PUBLIC_SNAPSHOT_BASE_URL is required");
  const url = new URL(raw.endsWith("/") ? raw : `${raw}/`);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash) throw new Error("PUBLIC_SNAPSHOT_BASE_URL must be an HTTPS public Vercel Blob directory URL");
  return url;
}
export function snapshotDigest(serialized: string) { return createHash("sha256").update(serialized).digest("hex"); }
export function validatePointer(value: unknown): SnapshotPointer {
  const pointer = value as SnapshotPointer;
  if (!pointer || typeof pointer.id !== "string" || typeof pointer.sha256 !== "string" || pointer.schema_version !== 1 || !/^[a-zA-Z0-9-]+$/.test(pointer.id) || !/^[a-f0-9]{64}$/.test(pointer.sha256)) throw new Error("Invalid public snapshot pointer");
  return pointer;
}
export async function fetchSnapshotVersion(base: URL, pointer: SnapshotPointer, fetcher: typeof fetch = fetch): Promise<PublicSnapshot> {
  const response = await fetcher(new URL(`${pointer.id}.json`, base), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Published snapshot download failed");
  const serialized = await boundedText(response, 6 * 1024 * 1024);
  if (snapshotDigest(serialized) !== pointer.sha256) throw new Error("Published snapshot integrity check failed");
  const manifest = validateManifest(JSON.parse(serialized), pointer.id);
  const insights: PublicSnapshot["tables"]["insights"] = [];
  let totalBytes = Buffer.byteLength(serialized);
  for (let from = 0; from < manifest.transport.chunks.length; from += 4) {
    const batch = await Promise.all(manifest.transport.chunks.slice(from, from + 4).map(async chunk => {
      const response = await fetcher(new URL(chunk.filename,base), {cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error("Published insight chunk unavailable");
      const text = await boundedText(response,4 * 1024 * 1024);
      totalBytes += Buffer.byteLength(text);
      if (totalBytes > MAX_SNAPSHOT_BYTES || snapshotDigest(text) !== chunk.sha256) throw new Error("Public chunk integrity check failed");
      const rows = JSON.parse(text);
      if (!Array.isArray(rows) || rows.length !== chunk.count || rows.length > 100) throw new Error("Invalid public insight chunk");
      return rows;
    }));
    insights.push(...batch.flat());
  }
  const snapshot = assembleSnapshot(manifest,insights);
  validateSnapshot(snapshot);
  if (snapshot.id !== pointer.id) throw new Error("Published snapshot version mismatch");
  return snapshot;
}
export function createRemoteSnapshotReader(fetcher: typeof fetch = fetch, now = Date.now) {
  let cached: { base: string; snapshot: PublicSnapshot; sha256: string; expires: number } | undefined;
  let pending: { base: string; promise: Promise<PublicSnapshot> } | undefined;
  let failed: {base:string;until:number} | undefined;
  return async (rawBase: string): Promise<PublicSnapshot> => {
    const base = snapshotBaseUrl(rawBase);
    if (cached?.base === base.href && cached.expires > now()) return cached.snapshot;
    if (failed?.base === base.href && failed.until > now()) {
      if (cached?.base === base.href) return cached.snapshot;
      throw new Error("Published snapshot temporarily unavailable");
    }
    if (pending?.base === base.href) return pending.promise;
    const promise = (async () => {
      const response = await fetcher(new URL("current.json", base), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Published snapshot pointer unavailable");
      const pointer = validatePointer(JSON.parse(await boundedText(response,2048)));
      const snapshot = cached?.base === base.href && cached.snapshot.id === pointer.id && cached.sha256 === pointer.sha256
        ? cached.snapshot : await fetchSnapshotVersion(base, pointer, fetcher);
      failed = undefined;
      cached = { base: base.href, snapshot, sha256: pointer.sha256, expires: now() + 60000 };
      return snapshot;
    })();
    const handled = promise.catch(error => { failed = {base:base.href,until:now()+60000}; if (cached?.base === base.href) return cached.snapshot; throw error; });
    pending = { base: base.href, promise: handled };
    try { return await handled; }
    finally { if (pending?.promise === handled) pending = undefined; }
  };
}
