import "server-only";

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

export function getSupabaseEnvironment(): { url: string; secretKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
  const apiKey = process.env.OPENAI_API_KEY;
  const missingVariables = [
    (!apiKey || apiKey === "your-openai-api-key") && "OPENAI_API_KEY",
  ].filter((value): value is string => Boolean(value));

  if (missingVariables.length > 0) throw new EnvironmentConfigurationError(missingVariables);
  return { apiKey: apiKey! };
}

export type TranscriptProviderName = "supadata" | "manual";

export function getTranscriptEnvironment(): { provider: TranscriptProviderName; supadataApiKey?: string } {
  const provider = process.env.TRANSCRIPT_PROVIDER?.trim().toLowerCase();
  if (!provider) throw new EnvironmentConfigurationError(["TRANSCRIPT_PROVIDER"]);
  if (provider !== "supadata" && provider !== "manual") {
    throw new InvalidEnvironmentConfigurationError(
      "TRANSCRIPT_PROVIDER",
      "must be one of: supadata, manual",
    );
  }
  if (provider === "supadata") {
    const apiKey = process.env.SUPADATA_API_KEY?.trim();
    if (!apiKey) throw new EnvironmentConfigurationError(["SUPADATA_API_KEY"]);
    return { provider, supadataApiKey: apiKey };
  }
  return { provider };
}
