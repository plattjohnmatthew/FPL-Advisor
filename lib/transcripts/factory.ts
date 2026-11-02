import "server-only";

import { getTranscriptEnvironment } from "@/lib/env";
import { ManualTranscriptProvider } from "./manual-provider";
import type { TranscriptProvider } from "./provider";
import { SupadataTranscriptProvider } from "./supadata-provider";
import { AuditedTranscriptProvider, type TranscriptProviderCallRecorder } from "./audited-provider";
import { YouTubeLocalTranscriptProvider } from "./youtube-local-provider";
import { TranscriptProviderChain } from "./provider-chain";

function createAdapter(name: "supadata" | "youtube_local" | "manual", configuration: ReturnType<typeof getTranscriptEnvironment>, recorder: TranscriptProviderCallRecorder) {
  const inner: TranscriptProvider = name === "supadata"
    ? new SupadataTranscriptProvider(configuration.supadataApiKey!, { allowAiFallback: configuration.supadataAllowAiFallback })
    : name === "youtube_local"
      ? new YouTubeLocalTranscriptProvider({ pythonCommand: configuration.youtubeTranscriptPythonCommand })
      : new ManualTranscriptProvider(async () => null);
  return new AuditedTranscriptProvider(name, inner, recorder);
}

export function createTranscriptProvider(recorder: TranscriptProviderCallRecorder): TranscriptProvider {
  const configuration = getTranscriptEnvironment();
  console.info(`Transcript providers: primary=${configuration.primary} fallback=${configuration.fallback}`);
  const primary = createAdapter(configuration.primary, configuration, recorder);
  const fallback = configuration.fallback === "none" ? null : createAdapter(configuration.fallback, configuration, recorder);
  return new TranscriptProviderChain(configuration.primary, primary, configuration.fallback === "none" ? null : configuration.fallback, fallback, recorder);
}
