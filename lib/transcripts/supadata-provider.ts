import "server-only";

import type { StoredEpisode } from "@/lib/processing/types";
import {
  TranscriptAcquisitionError,
  type NormalizedTranscriptResult,
  type TranscriptProvider,
  type TranscriptSegment,
} from "./provider";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;
type JsonRecord = Record<string, unknown>;

export type SupadataTranscriptProviderOptions = {
  fetcher?: FetchLike;
  sleep?: Sleep;
  maxRequestAttempts?: number;
  retryDelayMs?: number;
  maxJobPolls?: number;
  jobPollIntervalMs?: number;
};

const BASE_URL = "https://api.supadata.ai/v1/transcript";

export class SupadataTranscriptProvider implements TranscriptProvider {
  private readonly fetcher: FetchLike;
  private readonly sleep: Sleep;
  private readonly maxRequestAttempts: number;
  private readonly retryDelayMs: number;
  private readonly maxJobPolls: number;
  private readonly jobPollIntervalMs: number;

  constructor(private readonly apiKey: string, options: SupadataTranscriptProviderOptions = {}) {
    if (!apiKey.trim()) throw new TranscriptAcquisitionError("SUPADATA_API_KEY is required.", "CONFIGURATION");
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxRequestAttempts = options.maxRequestAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.maxJobPolls = options.maxJobPolls ?? 60;
    this.jobPollIntervalMs = options.jobPollIntervalMs ?? 1000;
  }

  async acquireTranscript(episode: StoredEpisode): Promise<NormalizedTranscriptResult> {
    const requestUrl = new URL(BASE_URL);
    requestUrl.searchParams.set("url", episode.sourceUrl || `https://www.youtube.com/watch?v=${episode.externalEpisodeId}`);
    requestUrl.searchParams.set("mode", "auto");
    const initial = await this.request(requestUrl);
    const payload = await this.readJson(initial);

    if (initial.status === 202) {
      const jobId = this.stringField(payload, "jobId");
      if (!jobId) throw this.malformed("Supadata accepted the transcript request without returning a job ID.");
      return this.pollJob(jobId);
    }
    return this.normalize(payload);
  }

  private async pollJob(jobId: string): Promise<NormalizedTranscriptResult> {
    for (let poll = 0; poll < this.maxJobPolls; poll += 1) {
      if (poll > 0) await this.sleep(this.jobPollIntervalMs);
      const response = await this.request(`${BASE_URL}/${encodeURIComponent(jobId)}`);
      const payload = await this.readJson(response);
      const status = this.stringField(payload, "status");
      if (status === "completed") {
        const result = this.isRecord(payload.result) ? payload.result : payload;
        return this.normalize(result);
      }
      if (status === "failed") {
        throw new TranscriptAcquisitionError(
          `Supadata could not acquire the transcript: ${this.errorDetail(payload)}`,
          "PERMANENT",
        );
      }
      if (status !== "queued" && status !== "active") {
        throw this.malformed("Supadata returned an unknown transcript job status.");
      }
    }
    throw new TranscriptAcquisitionError("Supadata transcript processing did not finish within the polling limit.", "TRANSIENT");
  }

  private async request(url: string | URL): Promise<Response> {
    let lastError: TranscriptAcquisitionError | null = null;
    for (let attempt = 1; attempt <= this.maxRequestAttempts; attempt += 1) {
      try {
        const response = await this.fetcher(url, {
          headers: { Accept: "application/json", "x-api-key": this.apiKey },
          signal: AbortSignal.timeout(30_000),
        });
        if (response.status === 206) {
          const payload = await this.readJson(response, false);
          throw new TranscriptAcquisitionError(`Supadata transcript unavailable: ${this.errorDetail(payload)}`, "PERMANENT");
        }
        if (response.ok || response.status === 202) return response;
        const payload = await this.readJson(response, false);
        const detail = this.errorDetail(payload);
        if (response.status === 403 || response.status === 404) {
          throw new TranscriptAcquisitionError(`Supadata transcript unavailable: ${detail}`, "PERMANENT");
        }
        if (response.status === 400) {
          throw new TranscriptAcquisitionError(`Supadata rejected the video: ${detail}`, "PERMANENT");
        }
        if (response.status === 401 || response.status === 402) {
          throw new TranscriptAcquisitionError(`Supadata configuration error: ${detail}`, "CONFIGURATION");
        }
        if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
          lastError = new TranscriptAcquisitionError(`Temporary Supadata failure (HTTP ${response.status}): ${detail}`, "TRANSIENT");
        } else {
          throw new TranscriptAcquisitionError(`Supadata request failed (HTTP ${response.status}): ${detail}`, "PERMANENT");
        }
      } catch (error) {
        if (error instanceof TranscriptAcquisitionError && error.kind !== "TRANSIENT") throw error;
        const message = error instanceof Error ? error.message : "Network request failed";
        lastError = error instanceof TranscriptAcquisitionError
          ? error
          : new TranscriptAcquisitionError(`Temporary Supadata network failure: ${message}`, "TRANSIENT");
      }
      if (attempt < this.maxRequestAttempts) await this.sleep(this.retryDelayMs * attempt);
    }
    throw lastError ?? new TranscriptAcquisitionError("Supadata transcript request failed.", "TRANSIENT");
  }

  private normalize(payload: JsonRecord): NormalizedTranscriptResult {
    const content = payload.content;
    const language = this.stringField(payload, "lang") || null;
    if (typeof content === "string") {
      const rawText = content.trim();
      if (!rawText) throw new TranscriptAcquisitionError("Supadata returned a transcript with no speech.", "PERMANENT");
      return { rawText, language, durationSeconds: null, providerName: "supadata" };
    }
    if (!Array.isArray(content)) throw this.malformed("Supadata response did not contain transcript content.");
    const segments: TranscriptSegment[] = content.map((item) => {
      if (!this.isRecord(item) || typeof item.text !== "string" || !Number.isFinite(item.offset) || !Number.isFinite(item.duration)) {
        throw this.malformed("Supadata returned an invalid transcript segment.");
      }
      const offset = Number(item.offset);
      const duration = Number(item.duration);
      if (offset < 0 || duration < 0 || !item.text.trim()) throw this.malformed("Supadata returned an invalid transcript segment.");
      return { startSeconds: offset / 1000, endSeconds: (offset + duration) / 1000, text: item.text.trim() };
    });
    if (segments.length === 0) throw new TranscriptAcquisitionError("Supadata returned a transcript with no speech.", "PERMANENT");
    return {
      rawText: segments.map((segment) => segment.text).join(" "),
      language,
      durationSeconds: Math.ceil(Math.max(...segments.map((segment) => segment.endSeconds ?? segment.startSeconds))),
      providerName: "supadata",
      segments,
    };
  }

  private async readJson(response: Response, strict = true): Promise<JsonRecord> {
    try {
      const value: unknown = await response.json();
      if (this.isRecord(value)) return value;
    } catch {
      // Mapped below without exposing response bodies or credentials.
    }
    if (strict) throw this.malformed("Supadata returned malformed JSON.");
    return {};
  }

  private errorDetail(payload: JsonRecord) {
    return this.stringField(payload, "details") || this.stringField(payload, "message") || this.stringField(payload, "error") || "No details provided";
  }

  private stringField(payload: JsonRecord, field: string) {
    return typeof payload[field] === "string" ? payload[field].trim() : "";
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private malformed(message: string) {
    return new TranscriptAcquisitionError(message, "PERMANENT");
  }
}
