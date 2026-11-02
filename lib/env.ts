import "server-only";
import { requireCapability } from "./app-config";

export class EnvironmentConfigurationError extends Error {
  constructor(public readonly missingVariables: string[]) {
    super(`Missing required environment variables: ${missingVariables.join(", ")}`);
    this.name = "EnvironmentConfigurationError";
  }
}

export class InvalidEnvironmentConfigurationError extends Error {
  constructor(public readonly variable: string, reason: string) {
    super(`Invalid environment variable ${variable}: ${reason}`);
    this.name = "InvalidEnvironmentConfigurationError";
  }
}

export function getSupabaseEnvironment(): { url: string; secretKey: string; publicApiKey?: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  requireCapability("canWriteData");
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const missingVariables = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !secretKey && "SUPABASE_SECRET_KEY",
  ].filter((value): value is string => Boolean(value));

  if (missingVariables.length > 0) {
    throw new EnvironmentConfigurationError(missingVariables);
  }

  return { url: url!, secretKey: secretKey! };
}

export function getOpenAIEnvironment(): { apiKey: string } {
  requireCapability("canAskAI");
  const apiKey = process.env.OPENAI_API_KEY;
  const missingVariables = [
    (!apiKey || apiKey === "your-openai-api-key") && "OPENAI_API_KEY",
  ].filter((value): value is string => Boolean(value));

  if (missingVariables.length > 0) throw new EnvironmentConfigurationError(missingVariables);
  return { apiKey: apiKey! };
}

export function getFplEntryEnvironment(): { entryId: number } {
  const raw = process.env.FPL_ENTRY_ID?.trim();
  if (!raw) throw new EnvironmentConfigurationError(["FPL_ENTRY_ID"]);
  if (!/^\d+$/.test(raw)) throw new InvalidEnvironmentConfigurationError("FPL_ENTRY_ID", "must be a positive integer");
  const entryId = Number(raw);
  if (!Number.isSafeInteger(entryId) || entryId <= 0) throw new InvalidEnvironmentConfigurationError("FPL_ENTRY_ID", "must be a positive safe integer");
  return { entryId };
}

export type TranscriptProviderName = "supadata" | "youtube_local" | "manual";
export type TranscriptFallbackProviderName = "supadata" | "youtube_local" | "none";

export function getTranscriptEnvironment(): { primary: TranscriptProviderName; fallback: TranscriptFallbackProviderName; supadataApiKey?: string; supadataAllowAiFallback: boolean; youtubeTranscriptPythonCommand: string } {
  requireCapability("canProcessSources");
  const primaryVariable = process.env.TRANSCRIPT_PROVIDER_PRIMARY?.trim() ? "TRANSCRIPT_PROVIDER_PRIMARY" : "TRANSCRIPT_PROVIDER";
  const primary = (process.env.TRANSCRIPT_PROVIDER_PRIMARY ?? process.env.TRANSCRIPT_PROVIDER)?.trim().toLowerCase();
  if (!primary) throw new EnvironmentConfigurationError(["TRANSCRIPT_PROVIDER_PRIMARY"]);
  if (primary !== "supadata" && primary !== "youtube_local" && primary !== "manual") {
    throw new InvalidEnvironmentConfigurationError(
      primaryVariable,
      "must be one of: supadata, youtube_local, manual",
    );
  }
  const fallback = (process.env.TRANSCRIPT_PROVIDER_FALLBACK?.trim().toLowerCase() || "none") as TranscriptFallbackProviderName;
  if (fallback !== "supadata" && fallback !== "youtube_local" && fallback !== "none") {
    throw new InvalidEnvironmentConfigurationError("TRANSCRIPT_PROVIDER_FALLBACK", "must be one of: supadata, youtube_local, none");
  }
  if (fallback === primary) throw new InvalidEnvironmentConfigurationError("TRANSCRIPT_PROVIDER_FALLBACK", "must differ from the primary provider");
  if (primary === "manual" && fallback !== "none") throw new InvalidEnvironmentConfigurationError("TRANSCRIPT_PROVIDER_FALLBACK", "manual mode does not support an automatic fallback");
  if (primary === "supadata" || fallback === "supadata") {
    const apiKey = process.env.SUPADATA_API_KEY?.trim();
    if (!apiKey) throw new EnvironmentConfigurationError(["SUPADATA_API_KEY"]);
    const allowAiFallback = process.env.SUPADATA_ALLOW_AI_FALLBACK?.trim().toLowerCase() ?? "false";
    if (allowAiFallback !== "true" && allowAiFallback !== "false") throw new InvalidEnvironmentConfigurationError("SUPADATA_ALLOW_AI_FALLBACK", "must be true or false");
    return { primary, fallback, supadataApiKey: apiKey, supadataAllowAiFallback: allowAiFallback === "true", youtubeTranscriptPythonCommand: process.env.YOUTUBE_TRANSCRIPT_PYTHON_COMMAND?.trim() || "python" };
  }
  return { primary, fallback, supadataAllowAiFallback: false, youtubeTranscriptPythonCommand: process.env.YOUTUBE_TRANSCRIPT_PYTHON_COMMAND?.trim() || "python" };
}
