# FPL Research

A personal Fantasy Premier League research application built with Next.js, TypeScript, and Supabase.

Run the full application locally with **your own database and API keys**. It starts with an empty research corpus; the author's database, transcripts, squad and private settings are not included. The hosted public edition reads explicitly published snapshots and disables processing, generation and writes. Both editions use this codebase.

The application has **no authentication**. Keep private mode on your own computer and bind it to localhost; do not expose it through a public server, tunnel or port forward. Processing and AI requests use your accounts and can incur provider charges.

## Prerequisites

- Node.js 22 or newer.
- npm.
- A Supabase project.

## Local setup

Clone the repository first:

```powershell
git clone https://github.com/plattjohnmatthew/FPL-Advisor.git
cd FPL-Advisor
```

1. Install dependencies:

   ```powershell
   npm ci
   ```

2. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. In the Supabase dashboard, open **Project Settings > API** and update `.env.local`:

   - Set `NEXT_PUBLIC_SUPABASE_URL` to the project URL.
   - Set `SUPABASE_SECRET_KEY` to a secret API key beginning with `sb_secret_`. Keep this value server-side and never commit it.
   - A Supabase publishable key is not needed in this milestone because the application does not create a browser-side Supabase client.
   - Set `OPENAI_API_KEY` to a real OpenAI project API key. It is used server-side for extraction, split detection, synthesis, query interpretation and grounded answers.
   - Optionally override the central task model policy with `OPENAI_EXTRACTION_MODEL`, `OPENAI_QUERY_MODEL`, `OPENAI_SPLIT_MODEL`, `OPENAI_SYNTHESIS_MODEL`, and `OPENAI_CHAT_MODEL`. The recommended defaults are shown in `.env.example`; malformed overrides fail and no task silently escalates to a frontier alias.
   - Set `FPL_SEASON_START_DATE` and `FPL_SEASON_END_DATE` as `YYYY-MM-DD` values for the chat's **This season** scope.
   - Set `TRANSCRIPT_PROVIDER_PRIMARY=supadata` and `TRANSCRIPT_PROVIDER_FALLBACK=youtube_local` for paid-first acquisition with a free local-caption fallback.
   - Reverse those values for free-first processing, or set the fallback to `none` for exactly one provider attempt.
   - Set `SUPADATA_API_KEY` to the key from your Supadata dashboard. Keep it server-side and never add `NEXT_PUBLIC_` to its name.
   - Keep `SUPADATA_ALLOW_AI_FALLBACK=false` for native-caption-only, cost-safe processing. Set it to `true` only when you intentionally want Supadata to generate missing transcripts with per-minute AI credits.

4. Apply the version-controlled Supabase migrations to your own project using the Supabase CLI (link your project, then run `npx supabase db push`). For a local database, start Docker and use `npm run db:start` and `npm run db:reset` instead. Never point database reset commands at an existing hosted corpus. Optionally set `FPL_ENTRY_ID` to your public entry ID for My Squad.

   For a new, dedicated hosted project:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   Obtain the reference from your own Supabase project. Review the linked target before pushing; do not use the author's project or an unrelated database. Migrations include historical demo cleanup and guarded source repairs, so use a fresh project for first setup. No research/demo corpus is seeded. Docker is needed only for the local Supabase option, not a hosted project.

5. Set `APP_MODE=private` and start the development server:

   ```powershell
   npm run dev -- --hostname 127.0.0.1
   ```

6. Open [http://localhost:3000](http://localhost:3000) for Overview. Sources manages processing; Intelligence browses saved research and briefings; Ask AI runs explicit research requests.

7. To test health directly, open [http://localhost:3000/api/health](http://localhost:3000/api/health). A successful connection returns HTTP 200. Missing or invalid Supabase credentials return HTTP 503 with an understandable JSON error; secrets are never included.

8. Select creators in Sources and explicitly process episodes. An empty Overview/Intelligence is expected until your first successful processing run. Generate a synthesis explicitly after processing. Optional squad pages need your own saved entry and an FPL registry sync.

For macOS/Linux, replace `Copy-Item .env.example .env.local` with `cp .env.example .env.local`; the npm and Supabase commands are the same. Set `APP_MODE=private` in `.env.local`, rather than relying on shell-specific assignment syntax. Choose model IDs available to your own OpenAI project using the `OPENAI_*_MODEL` settings; bundled defaults are configuration, not a guarantee of account access. Python and `python -m pip install youtube-transcript-api` are needed only when selecting the `youtube_local` adapter. Supadata requires its own key only when that provider is selected.

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

New episodes acquire transcripts through the provider chain selected by `TRANSCRIPT_PROVIDER_PRIMARY` and `TRANSCRIPT_PROVIDER_FALLBACK`. Existing stored transcripts are always reused before the chain is called. The primary is attempted once (subject to its own bounded transient retries), and at most one fallback is attempted only for quota exhaustion, rate limits, provider unavailability, or request blocking. Invalid videos, unavailable captions, malformed output, and configuration errors never trigger a blind fallback. Both adapters produce the same normalized result before hashing, permanent Supabase storage, and unchanged OpenAI extraction.

`youtube_local` invokes the version-controlled Python bridge in `scripts/youtube_transcript_bridge.py`, which uses the free `youtube-transcript-api` package. Install it once with `python -m pip install youtube-transcript-api`. It supports manual and autogenerated captions with timestamped segments, but YouTube can block residential or especially cloud/datacenter IPs, captions may be disabled, and no availability SLA exists. A blocked local provider is recorded as `REQUEST_BLOCKED` and is not repeatedly retried automatically. The Supadata adapter defaults to native-caption-only mode; set `SUPADATA_ALLOW_AI_FALLBACK=true` only to explicitly permit its paid AI generation.

Each provider acquisition is recorded without transcript text or credentials. Run `npm run report:transcript-usage -- --from 2026-08-16 --to 2026-08-16` to see provider calls, unique videos, successes, failures, HTTP retries, duplicate calls, AI fallbacks, known billable credits, and provider breakdown for a UTC date range.

The seed/configuration enables Let's Talk FPL and The FPL Wire. The processing engine contains no creator-specific branches. To check both live feeds without changing the database, run:

```powershell
npm run verify:youtube-discovery
```

Episodes with stored transcripts are sent to the OpenAI Responses API using schema-constrained Structured Outputs. Validated insights, entities, roles, evidence, model, extraction version, and prompt version are stored atomically in Supabase. Failed extraction attempts remain retryable.

The dashboard always rebuilds Latest Transcripts from persisted Supabase records for the latest seven local calendar dates. Loading or refreshing the page never calls OpenAI. Synthesis is generated only when you select **Generate synthesis** or **Regenerate synthesis**; a matching stored report is reused across reloads, and new eligible episode content marks it stale until you explicitly regenerate it.

Synthesis is token-budgeted before any OpenAI call. Small scopes use the direct structured-insight path. Large scopes are deterministically grouped by creator/entity/category/recommendation/time horizon, reduced into bounded creator briefs, and then synthesized across distinct creators. Briefs retain original insight and episode IDs and are cached by scope, input hash, reduction prompt, and model. Regeneration reuses unchanged briefs and never fetches transcripts or reruns extraction. Invalid citations receive one same-model repair attempt and are then removed deterministically if still unsupported.

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
| `OPENAI_SYNTHESIS_REDUCTION_MODEL` | Optional override | Server only | Creator-brief reduction model; default `gpt-5.6-luna`. |
| `OPENAI_CHAT_MODEL` | Optional override | Server only | Grounded chat-answer model; default `gpt-5.4-mini`. Repair calls reuse this exact resolved model. |
| `SYNTHESIS_MAX_INPUT_TOKENS` | Optional | Server only | Conservative direct/final input ceiling; default `180000`. |
| `SYNTHESIS_REDUCTION_MAX_INPUT_TOKENS` | Optional | Server only | Per-creator reduction/chunk input ceiling; default `80000`. |
| `SYNTHESIS_RESERVED_OUTPUT_TOKENS` | Optional | Server only | Output capacity reserved before calls; default `12000`. |
| `SYNTHESIS_SAFETY_MARGIN_TOKENS` | Optional | Server only | Context safety margin; default `40000`. |
| `FPL_SEASON_START_DATE` | For This season chat scope | Server only | Inclusive local-calendar start date for the configured FPL season, in `YYYY-MM-DD` format. |
| `FPL_SEASON_END_DATE` | For This season chat scope | Server only | Inclusive local-calendar end date for the configured FPL season, in `YYYY-MM-DD` format. |
| `TRANSCRIPT_PROVIDER_PRIMARY` | Yes for processing runs | Server only | First adapter: `supadata`, `youtube_local`, or legacy development `manual`. |
| `TRANSCRIPT_PROVIDER_FALLBACK` | No | Server only | At most one fallback: `youtube_local`, `supadata`, or `none` (default). Must differ from primary. |
| `YOUTUBE_TRANSCRIPT_PYTHON_COMMAND` | When using `youtube_local` | Server only | Python executable available to Next.js; defaults to `python`, or use `py` when that launcher works locally. |
| `SUPADATA_API_KEY` | When either configured provider is `supadata` | Server only | Supadata transcript API authentication. |
| `SUPADATA_ALLOW_AI_FALLBACK` | No | Server only | Defaults to `false`. Set `true` only to permit paid AI generation when native captions are unavailable. |

Do not add `NEXT_PUBLIC_` to any secret key. Local `.env*` files are ignored by Git, except `.env.example`.

## Source release and license

Project-authored code is available under the [MIT license](LICENSE). Dependencies retain their own licenses; the bundled Geist font includes its [SIL Open Font License](public/fonts/OFL.txt). This license does not grant rights to third-party videos, transcripts, creator content, FPL data or branding. Obtain and use source material under its applicable terms.

The built-in extraction/synthesis prompts are source code and become public with this repository. Your database-stored custom instructions, credentials and research are local/private data. The live website's stronger prompt-exclusion checks concern delivered public pages and snapshots, not the source repository.

Before sharing a fork or changing visibility, run `npm run audit:repository` and review [repository release readiness](docs/PUBLIC_REPOSITORY_READINESS.md). Local QA screenshots are intentionally excluded from source control. See [SECURITY.md](SECURITY.md) for the supported deployment boundary and reporting guidance.

## Verify a real acquired transcript

1. Start the application with `npm run dev` and open [http://localhost:3000](http://localhost:3000).
2. Select **Process new episodes**. The existing run engine discovers episodes, asks Supadata for missing transcripts, stores successful results, and continues into extraction.
3. In Supabase, open **Table Editor > transcripts** and sort `fetched_at` newest first. A successful row contains `raw_text`, `content_hash`, optional `segments`, and `provider` set to `supadata`.
4. Open **Table Editor > run_episodes** to inspect the episode state. Transcript failures appear as `FAILED` with `error_message` and can be retried by a later processing run.

To add another provider later, implement the existing `TranscriptProvider` interface, map its response to the normalized result, and register its name in the server-only provider factory. Existing transcript rows remain usable and retain their original `provider` value. The old `TRANSCRIPT_PROVIDER` variable remains a temporary primary-only compatibility alias, but new configuration should use `TRANSCRIPT_PROVIDER_PRIMARY`.

## Public snapshot and showcase

Generate sanitized research locally with `npm run publish:public` in private mode. Preview with `APP_MODE=public_read_only` and `npm run dev`. The public deployment reads generated files and needs no Supabase, OpenAI or transcript-provider credentials. See [publishing and deployment](docs/PUBLIC_SNAPSHOTS.md) and [showcase behavior](docs/PUBLIC_SHOWCASE.md).

`NEXT_PUBLIC_GITHUB_REPO_URL` sets the single canonical source/setup link. Public actions explain how to run locally; they never start paid or mutating backend work. Personal squad publication and display are off by default. Keep your `.env.local`, API keys and signing/service credentials out of version control and hosting artifacts.

## Deploy the public edition

Use the existing Vercel `team-john1/fpl-advisor` project and the same Git repository. Recommended address: `fpl.john-platt.com`, because the apex website is WordPress.com. See [concise deployment instructions](docs/PUBLIC_DEPLOYMENT.md) for setup, exact local commands, independent data publishing, and both rollback procedures. No DNS or production settings are changed by repository configuration alone.

- Code: reviewed Git push → Vercel `npm run build:public`.
- Data: private local `npm run publish:public-data` → sanitized immutable public Blob snapshot → current pointer; no code rebuild.
- Verify: `npm run check:public-http` after the public production build; public actions remain server-denied.

## Public release security audit

See [the release report](docs/PUBLIC_RELEASE_SECURITY_REPORT.md). `npm run audit:public-endpoints` inventories server routes; `npm run audit:public-secrets` compares built public surfaces with real private settings locally after the HTTP audit. Public data releases use integrity-checked insight chunks of at most 100 records, not a monolithic corpus download. Review the one-time transport migration before production promotion.
