import { publicSnapshotFiles } from "./transport";
import "server-only";
import { requireCapability } from "@/lib/app-config";
import { snapshotBaseUrl, snapshotDigest, validatePointer, type SnapshotPointer } from "./remote";
import { validateSnapshot, type PublicSnapshot } from "./schema";
export type PutSnapshotObject = (pathname: string, body: string, options: { access: "public"; addRandomSuffix: false; allowOverwrite: boolean; cacheControlMaxAge: number; contentType: string; token: string }) => Promise<{ url: string }>;
export function getPublishingEnvironment() {
  requireCapability("canWriteData");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required locally to publish data; never configure it on the public app");
  const base = snapshotBaseUrl(process.env.PUBLIC_SNAPSHOT_BASE_URL ?? "");
  const storeId = token.startsWith("vercel_blob_rw_") ? token.split("_")[3]?.toLowerCase() : undefined;
  if (!storeId || base.hostname !== `${storeId}.public.blob.vercel-storage.com`) throw new Error("BLOB_READ_WRITE_TOKEN must belong to PUBLIC_SNAPSHOT_BASE_URL's store");
  return { token, base };
}
export async function activateRemoteSnapshot(pointer: SnapshotPointer, put: PutSnapshotObject) {
  const { token, base } = getPublishingEnvironment();
  validatePointer(pointer);
  await put(`${base.pathname.slice(1)}current.json`, JSON.stringify(pointer), { access: "public", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: "application/json", token });
}
export async function publishRemoteSnapshot(snapshot: PublicSnapshot, put: PutSnapshotObject) {
  const { token, base } = getPublishingEnvironment();
  validateSnapshot(snapshot);
  const { serialized, chunks } = publicSnapshotFiles(snapshot);
  for (const chunk of chunks) {
    const result = await put(`${base.pathname.slice(1)}${chunk.filename}`,chunk.serialized,{access:"public",addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:31536000,contentType:"application/json",token});
    if (new URL(result.url).href !== new URL(chunk.filename,base).href) throw new Error("Blob store mismatch; current pointer was not changed");
  }
  const pointer: SnapshotPointer = { schema_version: 1, id: snapshot.id, sha256: snapshotDigest(serialized) };
  const uploaded = await put(`${base.pathname.slice(1)}${snapshot.id}.json`, serialized, { access: "public", addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 31536000, contentType: "application/json", token });
  if (new URL(uploaded.url).href !== new URL(`${snapshot.id}.json`, base).href) throw new Error("Blob token does not match configured public snapshot store; current pointer was not changed");
  // Only a successful immutable upload permits the single current-pointer overwrite.
  await activateRemoteSnapshot(pointer, put);
  return pointer;
}
