import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

type Arguments = { source: string; title: string; date: string; url: string; file: string; gameweek?: string };

function usage() {
  return 'npm run import:test-transcript -- --source "FPL Wire" --title "GW3 Preview" --date "2026-08-07" --url "https://..." --file "./test-transcripts/fpl-wire-gw3.txt" [--gameweek 3]';
}

function parseArguments(values: string[]): Arguments {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error(`Invalid arguments.\nUsage: ${usage()}`);
    parsed[flag.slice(2)] = value;
  }
  for (const required of ["source", "title", "date", "url", "file"] as const) {
    if (!parsed[required]?.trim()) throw new Error(`Missing --${required}.\nUsage: ${usage()}`);
  }
  return parsed as Arguments;
}

function validateDate(value: string) {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || Number.isNaN(date.valueOf())) throw new Error("--date must be a valid date such as 2026-08-07.");
  return date.toISOString();
}

async function main() {
  loadEnvConfig(process.cwd());
  if (process.argv.slice(2).includes("--help")) {
    console.log(`Usage:\n${usage()}`);
    return;
  }
  const args = parseArguments(process.argv.slice(2));
  const filePath = path.resolve(args.file);
  if (path.extname(filePath).toLowerCase() !== ".txt") throw new Error("--file must point to a .txt transcript file.");
  new URL(args.url);

  const gameweek = args.gameweek === undefined ? null : Number(args.gameweek);
  if (gameweek !== null && (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38)) throw new Error("--gameweek must be a whole number from 1 to 38.");

  const rawText = await readFile(filePath, "utf8");
  const { importTestTranscript } = await import("../lib/development/test-transcript-import");
  console.log(`Importing: ${args.title}`);
  console.log(`Source: ${args.source}`);
  const result = await importTestTranscript({ sourceName: args.source.trim(), episodeTitle: args.title.trim(), publishedAt: validateDate(args.date), sourceUrl: args.url, gameweek, rawText });

  console.log("\nImport successful.");
  console.log(`Source: ${result.sourceCreated ? "created" : "reused"}`);
  console.log(`Episode: ${result.episodeCreated ? "created" : "reused"} (${result.episodeId})`);
  console.log(`Transcript: ${result.transcriptCreated ? "created" : "reused"} (${result.transcriptId})`);
  console.log(result.extractionSkipped ? "Extraction: already present; skipped without another OpenAI call" : `Extraction: completed; ${result.insightsCreated} insights created`);
}

main().catch((error) => {
  console.error("\nImport failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
