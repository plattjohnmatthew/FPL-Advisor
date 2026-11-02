import "server-only";
import { createHash } from "node:crypto";
import type { PublicSnapshot, PublicRow } from "./schema";
export const MAX_SNAPSHOT_BYTES = 25 * 1024 * 1024;
export const INSIGHTS_PER_OBJECT = 100;
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export type PublicChunk = { filename: string; sha256: string; count: number };
export type PublicManifest = PublicSnapshot & { transport: { format: "insight-chunks-v1"; chunks: PublicChunk[] } };
export function publicSnapshotFiles(snapshot: PublicSnapshot) {
  const chunks: Array<PublicChunk & { serialized: string }> = [];
  for (let i = 0; i < snapshot.tables.insights.length; i += INSIGHTS_PER_OBJECT) {
    const rows = snapshot.tables.insights.slice(i, i + INSIGHTS_PER_OBJECT);
    const serialized = JSON.stringify(rows);
    if (Buffer.byteLength(serialized) > 4 * 1024 * 1024) throw new Error("Public insight chunk exceeds size limit");
    chunks.push({ filename: `${snapshot.id}-insights-${i / INSIGHTS_PER_OBJECT}.json`, sha256: digest(serialized), count: rows.length, serialized });
  }
  const manifest: PublicManifest = { ...snapshot, tables: { ...snapshot.tables, insights: [] }, transport: { format: "insight-chunks-v1", chunks: chunks.map(({filename,sha256,count}) => ({filename,sha256,count})) } };
  const serialized = JSON.stringify(manifest);
  if (Buffer.byteLength(serialized) > 6 * 1024 * 1024) throw new Error("Public manifest exceeds size limit");
  return { manifest, serialized, chunks };
}
export async function boundedText(response: Response, maxBytes: number): Promise<string> {
  if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("Public object exceeds size limit");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Public object body is missing");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error("Public object exceeds size limit"); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export function validateManifest(value: unknown, id: string): PublicManifest {
  const manifest = value as PublicManifest;
  if (!manifest || manifest.id !== id || manifest.transport?.format !== "insight-chunks-v1" || !Array.isArray(manifest.transport.chunks) || manifest.transport.chunks.length > 256 || !Array.isArray(manifest.tables?.insights) || manifest.tables.insights.length) throw new Error("A chunked public snapshot is required; republish data before promotion");
  const filenames = new Set<string>(); let count = 0;
  for (const chunk of manifest.transport.chunks) {
    if (typeof chunk.filename !== "string" || !chunk.filename.startsWith(`${id}-insights-`) || !/^[a-zA-Z0-9-]+-insights-\d+\.json$/.test(chunk.filename) || filenames.has(chunk.filename) || !/^[a-f0-9]{64}$/.test(chunk.sha256) || !Number.isInteger(chunk.count) || chunk.count < 1 || chunk.count > INSIGHTS_PER_OBJECT) throw new Error("Invalid public chunk manifest");
    filenames.add(chunk.filename); count += chunk.count;
  }
  if (count !== manifest.counts?.insights) throw new Error("Public chunk counts do not match manifest");
  return manifest;
}
export function assembleSnapshot(manifest: PublicManifest, insights: PublicRow[]): PublicSnapshot {
  const { transport, ...snapshot } = manifest;
  void transport;
  return { ...snapshot, tables: { ...snapshot.tables, insights } };
}
