import "server-only";

import { getTranscriptEnvironment } from "@/lib/env";
import { ManualTranscriptProvider } from "./manual-provider";
import type { TranscriptProvider } from "./provider";
import { SupadataTranscriptProvider } from "./supadata-provider";

export function createTranscriptProvider(): TranscriptProvider {
  const configuration = getTranscriptEnvironment();
  if (configuration.provider === "supadata") {
    return new SupadataTranscriptProvider(configuration.supadataApiKey!);
  }
  return new ManualTranscriptProvider(async () => null);
}
