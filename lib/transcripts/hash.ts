import { createHash } from "node:crypto";

export function hashTranscriptContent(rawText: string) {
  return createHash("sha256").update(rawText, "utf8").digest("hex");
}

