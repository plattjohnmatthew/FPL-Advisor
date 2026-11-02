import { requireCapability } from "@/lib/app-config";
import "server-only";

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { StoredEpisode } from "@/lib/processing/types";
import {
  TranscriptAcquisitionError, type NormalizedTranscriptResult, type TranscriptErrorCategory, type TranscriptProvider,
} from "./provider";

type Execute = (command: string, args: string[], options: { cwd: string; timeout: number; maxBuffer: number; windowsHide: boolean }) => Promise<{ stdout: string; stderr: string }>;
type BridgeResult = { ok: boolean; errorCode?: string; message?: string; language?: string; languageCode?: string; segments?: Array<{ text: string; start: number; duration: number }> };

const executeFile = promisify(execFile) as Execute;

export type YouTubeLocalTranscriptProviderOptions = { pythonCommand?: string; execute?: Execute; timeoutMs?: number; bridgePath?: string };

export class YouTubeLocalTranscriptProvider implements TranscriptProvider {
  private readonly pythonCommand: string;
  private readonly execute: Execute;
  private readonly timeoutMs: number;
  private readonly bridgePath: string;

  constructor(options: YouTubeLocalTranscriptProviderOptions = {}) {
    this.pythonCommand = options.pythonCommand?.trim() || "python";
    this.execute = options.execute ?? executeFile;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.bridgePath = options.bridgePath ?? join(process.cwd(), "scripts", "youtube_transcript_bridge.py");
  }

  async acquireTranscript(episode: StoredEpisode): Promise<NormalizedTranscriptResult> {
    requireCapability("canProcessSources");
    let stdout = "";
    try {
      ({ stdout } = await this.execute(this.pythonCommand, [this.bridgePath, episode.externalEpisodeId], {
        cwd: process.cwd(), timeout: this.timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true,
      }));
    } catch (error) {
      const failure = error as Error & { code?: string | number; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
      const parsed = this.parseBridge(failure.stdout ?? "");
      if (parsed && !parsed.ok) throw this.bridgeError(parsed);
      if (failure.code === "ENOENT") throw new TranscriptAcquisitionError(
        `Python executable '${this.pythonCommand}' was not found. Configure YOUTUBE_TRANSCRIPT_PYTHON_COMMAND.`, "CONFIGURATION", "PYTHON_NOT_FOUND",
      );
      if (failure.killed || failure.signal === "SIGTERM" || /timeout/i.test(failure.message)) throw new TranscriptAcquisitionError(
        `Local YouTube transcript retrieval timed out after ${this.timeoutMs}ms.`, "TRANSIENT", "PROVIDER_UNAVAILABLE",
      );
      const detail = this.safeDetail(failure.stderr);
      throw new TranscriptAcquisitionError(`Local YouTube transcript bridge failed${detail ? `: ${detail}` : "."}`, "PERMANENT", "SCRIPT_ERROR");
    }

    const parsed = this.parseBridge(stdout);
    if (!parsed) throw new TranscriptAcquisitionError("Local transcript bridge returned invalid JSON.", "PERMANENT", "MALFORMED_RESPONSE");
    if (!parsed.ok) throw this.bridgeError(parsed);
    if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) throw new TranscriptAcquisitionError("Local transcript bridge returned no caption segments.", "PERMANENT", "MALFORMED_RESPONSE");
    const segments = parsed.segments.map((item) => {
      if (!item.text?.trim() || !Number.isFinite(item.start) || !Number.isFinite(item.duration) || item.start < 0 || item.duration < 0) {
        throw new TranscriptAcquisitionError("Local transcript bridge returned an invalid caption segment.", "PERMANENT", "MALFORMED_RESPONSE");
      }
      return { text: item.text.trim(), startSeconds: item.start, endSeconds: item.start + item.duration };
    });
    return {
      rawText: segments.map((segment) => segment.text).join(" "), language: parsed.languageCode || parsed.language || null,
      durationSeconds: Math.ceil(Math.max(...segments.map((segment) => segment.endSeconds))), providerName: "youtube_local", segments,
      audit: { responseStatus: null, aiFallbackAllowed: false, aiFallbackUsed: false, httpRequestCount: 1, retryAttemptCount: 0, billableRequestCount: 0 },
    };
  }

  private parseBridge(value: string): BridgeResult | null {
    try { const parsed: unknown = JSON.parse(value.trim()); return typeof parsed === "object" && parsed !== null ? parsed as BridgeResult : null; }
    catch { return null; }
  }

  private bridgeError(result: BridgeResult) {
    const map: Record<string, { kind: "PERMANENT" | "TRANSIENT" | "CONFIGURATION"; category: TranscriptErrorCategory }> = {
      PACKAGE_NOT_INSTALLED: { kind: "CONFIGURATION", category: "PACKAGE_NOT_INSTALLED" },
      INVALID_VIDEO_ID: { kind: "PERMANENT", category: "INVALID_REQUEST" },
      TRANSCRIPT_UNAVAILABLE: { kind: "PERMANENT", category: "TRANSCRIPT_UNAVAILABLE" },
      VIDEO_UNAVAILABLE: { kind: "PERMANENT", category: "VIDEO_UNAVAILABLE" },
      YOUTUBE_REQUEST_BLOCKED: { kind: "PERMANENT", category: "REQUEST_BLOCKED" },
      YOUTUBE_REQUEST_FAILED: { kind: "TRANSIENT", category: "PROVIDER_UNAVAILABLE" },
      MALFORMED_RESPONSE: { kind: "PERMANENT", category: "MALFORMED_RESPONSE" },
      SCRIPT_ERROR: { kind: "PERMANENT", category: "SCRIPT_ERROR" },
    };
    const classification = map[result.errorCode ?? ""] ?? { kind: "PERMANENT" as const, category: "SCRIPT_ERROR" as const };
    return new TranscriptAcquisitionError(result.message || "Local YouTube transcript provider failed.", classification.kind, classification.category);
  }

  private safeDetail(stderr?: string) {
    return stderr?.replace(/\s+/g, " ").trim().slice(0, 500) ?? "";
  }
}
