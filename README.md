# FPL Research

A personal Fantasy Premier League research application built with Next.js, TypeScript, and Supabase.

## Prerequisites

- Node.js 22 or newer.
- npm.
- A Supabase project.

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. In the Supabase dashboard, open **Project Settings > API** and update `.env.local`:

   - Set `NEXT_PUBLIC_SUPABASE_URL` to the project URL.
   - Set `SUPABASE_SECRET_KEY` to a secret API key beginning with `sb_secret_`. Keep this value server-side and never commit it.
   - A Supabase publishable key is not needed in this milestone because the application does not create a browser-side Supabase client.
   - Set `OPENAI_API_KEY` to a real OpenAI project API key. It is used only in server-side insight extraction code.
   - Optionally override the central task model policy with `OPENAI_EXTRACTION_MODEL`, `OPENAI_QUERY_MODEL`, `OPENAI_SPLIT_MODEL`, `OPENAI_SYNTHESIS_MODEL`, and `OPENAI_CHAT_MODEL`. The recommended defaults are shown in `.env.example`; malformed overrides fail and no task silently escalates to a frontier alias.
   - Set `FPL_SEASON_START_DATE` and `FPL_SEASON_END_DATE` as `YYYY-MM-DD` values for the chat's **This season** scope.
   - Set `TRANSCRIPT_PROVIDER=supadata` to select the production transcript adapter.
   - Set `SUPADATA_API_KEY` to the key from your Supadata dashboard. Keep it server-side and never add `NEXT_PUBLIC_` to its name.

4. Start the development server:

   ```powershell
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000). The homepage displays the Supabase connection status.

6. To test health directly, open [http://localhost:3000/api/health](http://localhost:3000/api/health). A successful connection returns HTTP 200. Missing or invalid Supabase credentials return HTTP 503 with an understandable JSON error; secrets are never included.

## Validation commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

To audit durable corpus relationships in the configured Supabase project without changing data, run:

```powershell
npm run diagnose:persistence
```

The command exits unsuccessfully if a completed processing attempt lacks its stored transcript, extraction audit, insights, or required completed states, or if a transcript/insight points to a missing episode.

## Processing runs

`POST /api/processing-runs` loads enabled sources from Supabase and discovers recent uploads through the YouTube public channel feed. The provider uses each source's immutable channel ID and its stored checkpoint; episode identity is still enforced by the database `(source_id, external_episode_id)` constraint.

New episodes acquire transcripts through the provider selected by `TRANSCRIPT_PROVIDER`. The Supadata adapter requests timestamped transcripts in automatic mode, polls bounded asynchronous jobs, retries transient failures up to three times, and maps permanent failures without retrying them during the same run. Existing stored transcripts are reused without another provider request. Provider responses are normalized before hashing, permanent Supabase storage, and OpenAI extraction.

The seed/configuration enables Let's Talk FPL and The FPL Wire. The processing engine contains no creator-specific branches. To check both live feeds without changing the database, run:

```powershell
npm run verify:youtube-discovery
```

Episodes with stored transcripts are sent to the OpenAI Responses API using schema-constrained Structured Outputs. Validated insights, entities, roles, evidence, model, extraction version, and prompt version are stored atomically in Supabase. Failed extraction attempts remain retryable.

The dashboard always rebuilds Latest Transcripts from persisted Supabase records for the latest seven local calendar dates. Loading or refreshing the page never calls OpenAI. Synthesis is generated only when you select **Generate synthesis** or **Regenerate synthesis**; a matching stored report is reused across reloads, and new eligible episode content marks it stale until you explicitly regenerate it.

## Import real transcripts for development

Place local `.txt` files in `test-transcripts/`. That folder is ignored by Git. Import and extract one transcript with:

```powershell
npm run import:test-transcript -- --source "FPL Wire" --title "GW3 Preview" --date "2026-08-07" --url "https://example.com/episode" --gameweek 3 --file "./test-transcripts/fpl-wire-gw3.txt"
```

`--gameweek` is optional. The command loads `.env.local`, creates or reuses the source and episode, hashes and stores the transcript, invokes the normal OpenAI structured extraction service, and persists insights and entities through the normal atomic database function. Running the identical command again reuses the stored records and skips another OpenAI call.

Show command help with `npm run import:test-transcript -- --help`.

## Local database

Docker must be running. The Supabase CLI is installed as a pinned project dependency.

```powershell
npm run db:start
npm run db:reset
npm run db:test
```

`db:reset` recreates the local database entirely from `supabase/migrations` and does not load demo research. Deterministic demo records live in `supabase/tests/database/demo-fixture.inc` and are loaded only by the database test suite. Stop the local stack when finished with `npm run db:stop`.

To deploy migrations to a linked Supabase project, authenticate and link the CLI first, review the target carefully, then run `npx supabase db push`. Demo fixtures are not deployable seeds.

## Environment variables

| Variable | Required now | Exposure | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public | Supabase project URL. |
| `SUPABASE_SECRET_KEY` | Yes | Server only | Elevated Supabase access and the server-side connectivity check. |
| `OPENAI_API_KEY` | Yes for extraction | Server only | OpenAI Responses API authentication. |
| `OPENAI_EXTRACTION_MODEL` | Optional override | Server only | Transcript insight extraction model; default `gpt-5.6-luna`. |
| `OPENAI_QUERY_MODEL` | Optional override | Server only | Query interpretation/retrieval-plan model; default `gpt-5.6-luna`. |
| `OPENAI_SPLIT_MODEL` | Optional override | Server only | Split-decision candidate model; default `gpt-5.6-luna`. |
| `OPENAI_SYNTHESIS_MODEL` | Optional override | Server only | Report/synthesis model; default `gpt-5.4-mini`. |
| `OPENAI_CHAT_MODEL` | Optional override | Server only | Grounded chat-answer model; default `gpt-5.4-mini`. Repair calls reuse this exact resolved model. |
| `FPL_SEASON_START_DATE` | For This season chat scope | Server only | Inclusive local-calendar start date for the configured FPL season, in `YYYY-MM-DD` format. |
| `FPL_SEASON_END_DATE` | For This season chat scope | Server only | Inclusive local-calendar end date for the configured FPL season, in `YYYY-MM-DD` format. |
| `TRANSCRIPT_PROVIDER` | Yes for processing runs | Server only | Active transcript adapter. Use `supadata` in production or `manual` for development fallback. |
| `SUPADATA_API_KEY` | When provider is `supadata` | Server only | Supadata transcript API authentication. |

Do not add `NEXT_PUBLIC_` to any secret key. Local `.env*` files are ignored by Git, except `.env.example`.

## Verify a real acquired transcript

1. Start the application with `npm run dev` and open [http://localhost:3000](http://localhost:3000).
2. Select **Process new episodes**. The existing run engine discovers episodes, asks Supadata for missing transcripts, stores successful results, and continues into extraction.
3. In Supabase, open **Table Editor > transcripts** and sort `fetched_at` newest first. A successful row contains `raw_text`, `content_hash`, optional `segments`, and `provider` set to `supadata`.
4. Open **Table Editor > run_episodes** to inspect the episode state. Transcript failures appear as `FAILED` with `error_message` and can be retried by a later processing run.

To add another provider later, implement the existing `TranscriptProvider` interface, map its response to the normalized result, register its name in the server-only provider factory, and change `TRANSCRIPT_PROVIDER`. Existing transcript rows remain usable and retain their original `provider` value.
