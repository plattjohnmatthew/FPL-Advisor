import { YouTubeEpisodeDiscoveryProvider } from "../lib/processing/youtube-discovery";
import type { ProcessingSource, SourceCheckpoint } from "../lib/processing/types";

const sources: ProcessingSource[] = [
  { id: "live-ltfpl", name: "Let's Talk FPL", platform: "YOUTUBE", channelUrl: "https://www.youtube.com/@LetsTalkFPL", externalChannelId: "UCxeOc7eFxq37yW_Nc-69deA" },
  { id: "live-wire", name: "The FPL Wire", platform: "YOUTUBE", channelUrl: "https://www.youtube.com/@TheFPLWire", externalChannelId: "UCtIPFexB6PLKNNl0XH3SKKw" },
];

async function main() {
  const provider = new YouTubeEpisodeDiscoveryProvider();
  for (const source of sources) {
    const first = await provider.discoverEpisodes(source, null);
    if (first.length === 0) throw new Error(`${source.name} returned no public feed episodes.`);
    const latest = first.at(-1)!;
    const checkpoint: SourceCheckpoint = {
      sourceId: source.id, lastSuccessfulPublishedAt: latest.publishedAt,
      lastSuccessfulEpisodeExternalId: latest.externalEpisodeId, lastCheckedAt: new Date().toISOString(),
    };
    const second = await provider.discoverEpisodes(source, checkpoint);
    if (second.length !== 0) throw new Error(`${source.name} checkpoint rerun returned ${second.length} duplicate candidates.`);
    console.log(JSON.stringify({ source: source.name, firstRunEpisodes: first.length, secondRunEpisodes: second.length, latestEpisodeId: latest.externalEpisodeId }));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live discovery verification failed.");
  process.exitCode = 1;
});
