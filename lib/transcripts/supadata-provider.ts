import { requireCapability } from "@/lib/app-config";
import "server-only";

import type { StoredEpisode } from "@/lib/processing/types";
import {
  TranscriptAcquisitionError,
  type NormalizedTranscriptResult,
  type TranscriptProvider,
  type TranscriptProviderAuditMetadata,
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
  allowAiFallback?: boolean;
};

const BASE_URL = "https://api.supadata.ai/v1/transcript";

export class SupadataTranscriptProvider implements TranscriptProvider {
  private readonly fetcher: FetchLike;
  private readonly sleep: Sleep;
  private readonly maxRequestAttempts: number;
  private readonly retryDelayMs: number;
  private readonly maxJobPolls: number;
  private readonly jobPollIntervalMs: number;
  private readonly allowAiFallback: boolean;

  constructor(private readonly apiKey: string, options: SupadataTranscriptProviderOptions = {}) {
    if (!apiKey.trim()) throw new TranscriptAcquisitionError("SUPADATA_API_KEY is required.", "CONFIGURATION");
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxRequestAttempts = options.maxRequestAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.maxJobPolls = options.maxJobPolls ?? 60;
    this.jobPollIntervalMs = options.jobPollIntervalMs ?? 1000;
    this.allowAiFallback = options.allowAiFallback ?? false;
  }

  async acquireTranscript(episode: StoredEpisode): Promise<NormalizedTranscriptResult> {
    requireCapability("canProcessSources");
    const audit: TranscriptProviderAuditMetadata = { responseStatus: null, aiFallbackAllowed: this.allowAiFallback, aiFallbackUsed: false, httpRequestCount: 0, retryAttemptCount: 0, billableRequestCount: null };
    try {
      const requestUrl = new URL(BASE_URL);
      requestUrl.searchParams.set("url", episode.sourceUrl || `https://www.youtube.com/watch?v=${episode.externalEpisodeId}`);
      requestUrl.searchParams.set("mode", this.allowAiFallback ? "auto" : "native");
      const initial = await this.request(requestUrl, audit);
      const payload = await this.readJson(initial);
      if (initial.status === 202) {
        const jobId = this.stringField(payload, "jobId");
        if (!jobId) throw this.malformed("Supadata accepted the transcript request without returning a job ID.");
        return await this.pollJob(jobId, audit);
      }
      return { ...this.normalize(payload), audit };
    } catch (error) {
      this.attachAudit(error, audit);
      throw error;
    }
  }

  private async pollJob(jobId: string, audit: TranscriptProviderAuditMetadata): Promise<NormalizedTranscriptResult> {
    for (let poll = 0; poll < this.maxJobPolls; poll += 1) {
      if (poll > 0) await this.sleep(this.jobPollIntervalMs);
      const response = await this.request(`${BASE_URL}/${encodeURIComponent(jobId)}`, audit);
      const payload = await this.readJson(response);
      const status = this.stringField(payload, "status");
      if (status === "completed") {
        const result = this.isRecord(payload.result) ? payload.result : payload;
        return { ...this.normalize(result), audit };
      }
      if (status === "failed") {
        throw new TranscriptAcquisitionError(
          `Supadata could not acquire the transcript: ${this.errorDetail(payload)}`,
          "PERMANENT", "TRANSCRIPT_UNAVAILABLE",
        );
      }
      if (status !== "queued" && status !== "active") {
        throw this.malformed("Supadata returned an unknown transcript job status.");
      }
    }
    throw new TranscriptAcquisitionError("Supadata transcript processing did not finish within the polling limit.", "TRANSIENT", "PROVIDER_UNAVAILABLE");
  }

  private async request(url: string | URL, audit: TranscriptProviderAuditMetadata): Promise<Response> {
    let lastError: TranscriptAcquisitionError | null = null;
    for (let attempt = 1; attempt <= this.maxRequestAttempts; attempt += 1) {
      try {
        audit.httpRequestCount += 1;
        if (attempt > 1) audit.retryAttemptCount += 1;
        const response = await this.fetcher(url, {
          headers: { Accept: "application/json", "x-api-key": this.apiKey },
          signal: AbortSignal.timeout(30_000),
        });
        audit.responseStatus = response.status;
        const billableHeader = response.headers.get("x-billable-requests");
        const billable = billableHeader === null ? Number.NaN : Number(billableHeader);
        if (Number.isFinite(billable) && billable >= 0) {
          audit.billableRequestCount = (audit.billableRequestCount ?? 0) + billable;
          if (this.allowAiFallback) audit.aiFallbackUsed = billable > 1;
        } else if (this.allowAiFallback) audit.aiFallbackUsed = null;
        if (response.status === 206) {
          const payload = await this.readJson(response, false);
          throw new TranscriptAcquisitionError(`Supadata transcript unavailable: ${this.errorDetail(payload)}`, "PERMANENT", "TRANSCRIPT_UNAVAILABLE");
        }
        if (response.ok || response.status === 202) return response;
        const payload = await this.readJson(response, false);
        const detail = this.errorDetail(payload);
        if (response.status === 403 || response.status === 404) {
          throw new TranscriptAcquisitionError(`Supadata transcript unavailable: ${detail}`, "PERMANENT", "VIDEO_UNAVAILABLE");
        }
        if (response.status === 400) {
          throw new TranscriptAcquisitionError(`Supadata rejected the video: ${detail}`, "PERMANENT", "INVALID_REQUEST");
        }
        if (response.status === 401) {
          throw new TranscriptAcquisitionError(`Supadata configuration error: ${detail}`, "CONFIGURATION");
        }
        if (response.status === 402) {
          throw new TranscriptAcquisitionError(`Supadata quota or credits are exhausted: ${detail}`, "PERMANENT", "QUOTA_EXHAUSTED");
        }
        if (response.status === 429 && this.isQuotaExhaustion(detail)) {
          throw new TranscriptAcquisitionError(`Supadata quota or plan usage is exhausted: ${detail}`, "PERMANENT", "QUOTA_EXHAUSTED");
        }
        if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
          lastError = new TranscriptAcquisitionError(`Temporary Supadata failure (HTTP ${response.status}): ${detail}`, "TRANSIENT", response.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE");
        } else {
          throw new TranscriptAcquisitionError(`Supadata request failed (HTTP ${response.status}): ${detail}`, "PERMANENT");
        }
      } catch (error) {
        if (error instanceof TranscriptAcquisitionError && error.kind !== "TRANSIENT") throw error;
        const message = error instanceof Error ? error.message : "Network request failed";
        lastError = error instanceof TranscriptAcquisitionError
          ? error
          : new TranscriptAcquisitionError(`Temporary Supadata network failure: ${message}`, "TRANSIENT", "PROVIDER_UNAVAILABLE");
      }
      if (attempt < this.maxRequestAttempts) await this.sleep(this.retryDelayMs * attempt);
    }
    throw lastError ?? new TranscriptAcquisitionError("Supadata transcript request failed.", "TRANSIENT", "PROVIDER_UNAVAILABLE");
  }

  private normalize(payload: JsonRecord): NormalizedTranscriptResult {
    const content = payload.content;
    const language = this.stringField(payload, "lang") || null;
    if (typeof content === "string") {
      const rawText = content.trim();
      if (!rawText) throw new TranscriptAcquisitionError("Supadata returned a transcript with no speech.", "PERMANENT", "MALFORMED_RESPONSE");
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
    if (segments.length === 0) throw new TranscriptAcquisitionError("Supadata returned a transcript with no speech.", "PERMANENT", "MALFORMED_RESPONSE");
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

  private isQuotaExhaustion(detail: string) {
    return /(?:plan|quota|monthly|usage|credit).*(?:limit|exceed|exhaust|reach)|(?:limit|exceed|exhaust|reach).*(?:plan|quota|monthly|usage|credit)/i.test(detail);
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private malformed(message: string) {
    return new TranscriptAcquisitionError(message, "PERMANENT", "MALFORMED_RESPONSE");
  }

  private attachAudit(error: unknown, audit: TranscriptProviderAuditMetadata) {
    if (error instanceof TranscriptAcquisitionError) error.audit = { ...audit };
  }
}
