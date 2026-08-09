# Build Status

## Current milestone

Dedicated UX/UI audit and redesign: complete locally; no database migration required.

## Completed functionality

- Audited the actual locally rendered application before implementation at 1440px and 1024px, including processing controls, creator selection, URL batches, status/errors, synthesis, transcript browsing, chat, entity exploration, episode detail, and prompt settings. Data-dependent empty and failure states were inspected where available.
- Introduced stable navigation around Intelligence, Ask, Content, Explore, and Settings, plus a skip link and consistent keyboard focus treatment.
- Reordered the dashboard around product value: freshness and primary processing entry, compact processing status, latest intelligence, Ask, recent content, and entity exploration.
- Reworked idle processing into progressive disclosure with mutually exclusive Selected creators and Specific URLs modes, while preserving the existing run engine, cancellation, limits, creator persistence, and URL validation.
- Reduced report scanning cost with an editorial overview, collapsible thematic findings, distinct split-decision treatment, and a bounded recent-content list. Long run errors now sit behind technical-detail disclosure.
- Moved the existing database-backed AI instructions editor to `/settings`; Save and Reset behavior, protected prompt rules, versioning, and explicit regeneration semantics remain unchanged.
- Harmonized the dashboard, entity explorer, episode detail, and settings surfaces through a documented responsive visual system in `docs/UI_SYSTEM.md`.
- Re-ran the actual product after implementation at 1440px, 1024px, and 390px. Verified creator/URL mode switching, processing controls, synthesis display, Ask controls, settings persistence UI, entity search, populated episode detail/entity links, and no horizontal overflow at tested widths.
- Verified all 132 TypeScript tests, ESLint, TypeScript, and the Next.js 16.3 production build.

- Added a compact Player and team insights search entry on the dashboard plus a server-rendered `/entities` search page over canonical names and aliases. Browsing never creates or mutates entity records.
- Expanded `/entities/[entityId]` into a complete historical explorer with URL-persisted Last 7 days, Last 30 days, This season, All history, and Custom scopes; Last 30 days is the default.
- Filters insights at the database relationship query using `episodes.published_at`, never insight creation, transcript fetch, or processing dates, and retains existing entity/episode/date indexes.
- Added deterministic summary metadata for insight count, episode count, distinct creator count, creator-level sentiment, recommendation distribution, and category distribution without an OpenAI call.
- Reused the existing creator-opinion aggregation so repeated episodes from one source count once and self-contradiction remains MIXED.
- Added prominent relevant split-decision cards with competing positions, reasoning, and distinct supporting creator names/counts for the selected period.
- Added lightweight creator, category, recommendation, newest, oldest, and creator sorting while leaving stored history untouched.
- Preserved publication scope through search, entity, and episode links. Every insight retains creator, internal episode link, publication date, evidence, and provider-backed YouTube timestamp link where available.
- Audited the linked corpus: 138 canonical entities (115 players, 23 teams), no exact canonical duplicate groups, and a small set of possible surname/alias collisions retained for manual review rather than unsafe automatic merging.
- Real read-only validation passed for Arsenal: search found the canonical TEAM, Last 30 days returned 9 insights from 5 episodes and 4 distinct creators, All history retained 9, and a custom Aug 7 range correctly narrowed to 7 insights from 3 episodes and 3 creators. Internal episode navigation preserved the custom scope and exposed clickable episode entities.
- The linked corpus currently contains no Saka canonical entity or alias, so the requested Saka search correctly returns an empty state rather than demo/fabricated data.
- Verified 132 TypeScript tests, 131 pgTAP assertions from the unchanged schema, ESLint, TypeScript, and the Next.js 16.3 production build.

- Added read-only `/episodes/[episodeId]` audit pages showing episode identity, creator, publication date, original video, transcript/extraction state, insight count, and every persisted atomic insight for that episode only.
- Added adjacent claim, reasoning, taxonomy, clickable player/team entities, transcript evidence, human-readable timestamps, and safely constructed YouTube timestamp links. Historical insights without timestamps remain visible without fabricated timing.
- Made Latest Transcripts episode titles open the internal episode page while keeping a separate **Open original video** action on the audit page.
- Added lightweight episode filters for category, player/team, and recommendation.
- Added separate `/entities/[entityId]` player/team insight explorer pages so historical browsing does not leak into or broaden the episode-scoped page. Entity links preserve the current date range where available.
- Confirmed Supadata already normalizes real offset/duration segments and the application already persisted them in transcript JSONB. Added relational `transcript_segments` and `insight_evidence_segments` as the durable queryable provenance layer without duplicating the full transcript.
- New extraction prompts now provide stable integer segment IDs. Application and database validation reject missing/unknown segment references, derive the click timestamp from the first cited stored segment, and persist all cited segment links transactionally.
- Bumped future extraction identity to `fpl-insights-v2` / `fpl-insights-prompt-v2`; existing episodes are not automatically re-extracted or backfilled.
- Deployed additive migration `20260809070000_episode_insight_provenance.sql` to the linked Supabase project.
- Verified 120 TypeScript tests, 131 pgTAP database assertions, ESLint, TypeScript, a clean migration reset, and the Next.js 16.3 production build. Opening episode/entity pages performs no OpenAI call.

- Added a secondary **Specific YouTube videos** workflow that accepts 1–20 URLs, ignores blank lines, validates supported YouTube URL forms, canonicalizes video IDs, and rejects oversized batches without silently truncating them.
- Added one durable `SPECIFIC_URL_BATCH` processing run plus per-input `processing_run_url_items`, preserving normalized identity, classification, progress, episode linkage, errors, and terminal results across refreshes.
- Deduplicated alternate watch, short, live, embed, mobile, and `youtu.be` forms by canonical YouTube video ID before transcript or OpenAI work begins.
- Reused the existing episode orchestration, transcript acquisition, structured extraction, split detection, cancellation, retry, and final run-state logic rather than creating a second processing pipeline.
- Added server-side YouTube video metadata resolution and canonical creator upsert by channel ID. Newly encountered creators are enabled but not automatically selected for future creator-discovery runs.
- Made fully processed videos attach to the new run as `ALREADY_PROCESSED` without refetching metadata/transcripts or invoking OpenAI; partially processed videos resume through the existing retryable state machine.
- Added live and durable dashboard reporting for submitted, eligible, duplicate, invalid, already processed, completed, failed, and cancelled URLs, with source episode links and per-item error messages.
- Deployed additive migration `20260809060000_specific_url_batches.sql` to the linked Supabase project.
- Verified a clean migration reset, 125 pgTAP database assertions, 114 TypeScript tests, ESLint, TypeScript, and the Next.js 16.3 production build. Real paid-provider batch execution was intentionally not initiated without user-selected video URLs.

- Added a deterministic derived creator-opinion layer keyed by stable `sourceId`; repeated insights and episodes retain full provenance but count as one independent creator stance for a specific subject, category, and time horizon.
- Preserved each creator's dated insight and episode chronology. Conflicting positive and negative recommendations within a selected period resolve to `MIXED` rather than counting the creator on both sides.
- Supplied creator-level opinion groups to synthesis and split detection alongside the untouched atomic evidence, preventing flat insight volume from masquerading as creator breadth.
- Enforced distinct-creator report counts after model output, deterministically derives sentiment from one stance per creator, and recalculates older stored reports on read without making an OpenAI call.
- Hardened split validation so a creator cannot support competing positions through different insights. Their evidence moves to a chronological MIXED position only when independently supported competing positions still remain; otherwise the split candidate is discarded.
- Added distinct creator names/counts to report and split displays while preserving every supporting episode/insight link.
- Added separate report attention metrics for insight count, episode count, and distinct creator breadth; none is substituted for another.
- Bumped protected prompt identities to `fpl-editorial-report-v4`, `fpl-splits-prompt-v3`, and detection version `fpl-splits-v3`.
- Added all seven requested aggregation regressions and verified 104 TypeScript tests, 111 pgTAP assertions, ESLint, TypeScript, and the Next.js 16.3 production build.

- Added independent, database-backed extraction and synthesis custom instructions with a compact dashboard editor, Save, and Reset to default controls.
- Kept base system prompts, Structured Output schemas, taxonomy, grounding, provenance, evidence, and persistence validation application-controlled; custom text is delimited, lower-authority guidance and is never evidence.
- Added `app_settings` for current values and append-only `app_setting_versions` for historical auditability. Identical saves are idempotent and changed values increment independently.
- Extraction and synthesis now load their task-specific setting immediately before each future OpenAI call. Saving settings triggers no extraction, synthesis, or historical reprocessing.
- Stored prompt identities now combine the version-controlled base prompt version with the exact custom-instruction version; existing model audit fields remain unchanged.
- Existing reports remain visible after instruction changes and are explicitly marked as created under older instructions until the user clicks Regenerate.
- Verified 97 TypeScript tests, 111 pgTAP assertions, ESLint, TypeScript, a clean database reset, and the Next.js 16.3 production build.

- Centralized all OpenAI model selection in `lib/openai/model-policy.ts`; API routes, prompts, and feature services contain no model IDs.
- Set the task policy to `gpt-5.6-luna` for transcript extraction, query interpretation, and split detection, and `gpt-5.4-mini` for synthesis and grounded chat answers.
- Added five server-only environment overrides. Missing overrides use only the named cost-controlled recommended defaults; malformed overrides fail clearly, and no generic/frontier alias fallback exists.
- Made chat structured-output repair reuse the exact model resolved for the originating answer call and retain the same request correlation ID.
- Added one normalized `ai_usage_events` ledger for successful and failed extraction, query, split, synthesis, chat, and repair calls, including model, input/cached/output/total tokens, timestamps, estimated cost, and episode/run/request correlation where applicable.
- Added centralized, updateable token pricing metadata for `gpt-5.6-luna` and `gpt-5.4-mini`; unknown override models retain usage but report null estimated cost rather than an invented price.
- Removed the extraction-only console audit mechanism; all OpenAI calls now use the same secret-safe recorder, which never receives API keys, prompts, or transcript text.
- Updated `.env.example`, README, and the local non-secret model overrides to the new policy.
- Verified 92 TypeScript tests, 99 pgTAP assertions, ESLint, TypeScript, a clean database reset, and the Next.js 16.3 production build.

- Added a compact searchable creator multi-select to Processing, backed by Supabase rather than browser storage, with immediate select/deselect persistence and zero-selection blocking.
- Added server-side YouTube channel URL validation and canonical resolution for channel IDs, handles, custom URLs, and user URLs; new channels are verified through YouTube metadata, normalized, inserted as enabled/selected sources, and shown without a refresh.
- Preserved `sources.enabled` as the operational active flag and added `selected_by_default` as the independent next-run preference. Existing enabled production sources migrate selected; disabled rows remain unselected.
- Added generic relational `processing_run_sources` snapshots with restrictive historical foreign keys and atomic run creation/source validation. Processing now loads only the immutable snapshot and never discovers unselected or disabled sources.
- Preserved the existing date scope, cooperative stop behavior, and independent per-creator YouTube cap.
- Deployed migrations `20260809030000_selectable_source_library.sql` and `20260809030100_fix_source_selection_update_guard.sql` to hosted Supabase.
- Hosted validation passed: both existing creators loaded selected; deselection survived refresh; reselection persisted; `Planet FPL` resolved from `@PlanetFPL`, appeared selected immediately, and a trailing-slash duplicate returned the existing source without duplication.
- Ran a hosted two-source processing run with only Let's Talk FPL and The FPL Wire and a cap of one video per creator. Planet FPL was not queried; two episodes completed, eight were deferred, and the run retained exactly those two source names after the default selection was changed back to all three.
- Verified 87 TypeScript tests, 87 pgTAP assertions, ESLint, TypeScript, a clean migration reset, and the Next.js 16.3 production build.

- Audited the real Aug 3–9 corpus directly in hosted Supabase: all five visible episodes have persisted transcripts and 10–15 insights each (62 total); four have completed run attempts/extraction audits and the legacy manual import has durable transcript/insights without a run record.
- Confirmed the apparent 1-of-5 exclusion was an old successful one-episode synthesis left visible after later five-episode synthesis attempts failed report-label validation; the DATE_RANGE repository itself was not tied to a processing run.
- Centralized synthesis eligibility as episode publication date in range plus a persisted transcript plus at least one persisted insight, with explicit per-episode exclusion reasons; PARTIAL/CANCELLED run membership and split outcomes do not affect eligibility.
- Persisted synthesis eligibility/inclusion counts, excluded episode IDs with reasons, distinct creator count, exact episode links, date range, generated time, model, and prompt version.
- Changed invalid split output handling from whole-response failure to per-candidate validation and discard; overlapping evidence is explicitly prohibited in schema, prompt, and post-generation validation, and discarded candidates are recorded as derived warnings without making an otherwise successful run partial.
- Replaced report-validation failures for single-source findings with deterministic distinct-source normalization: SINGLE_SOURCE, MULTI_SOURCE_SUPPORT, CONSENSUS, SPLIT, and MIXED. Multiple episodes or insights from one source still count as one creator.
- Removed the run-status-driven Partial report banner. It now appears only when the stored synthesis metadata contains genuine episode exclusions, while split warnings are displayed separately.
- Made custom Synthesize period refresh and display the exact requested date scope instead of falling back to the automatic seven-day dashboard window.
- Regenerated the hosted Aug 3–9 report from stored insights only: 5 eligible, 5 included, 0 excluded, 2 distinct creators. Persisted evidence cites all five episodes and both Let's Talk FPL and The FPL Wire; no transcripts were fetched or re-extracted.
- Verified 81 TypeScript tests, 70 pgTAP assertions, ESLint, TypeScript, production build, clean migration reset, hosted migration deployment, and the real custom-period dashboard read model.

- Audited the configured hosted Supabase project: 2 canonical enabled sources, 1 real episode, 1 transcript, 12 insights, 25 insight/entity relationships, and no historical processing runs from the expected earlier batch.
- Repaired the imported `GW3 Preview` identity from its temporary development source to the canonical The FPL Wire source and YouTube video ID without replacing its transcript, insights, or provenance.
- Added a database completion guard: an episode cannot transition from `EXTRACTING` to `COMPLETED` without a ready stored transcript, a completed extraction audit, and persisted insights.
- Made Latest Transcripts load independently from processing-run history using `episodes.published_at`, stored transcripts, and stored insights; each row now exposes transcript state, extraction state, and insight count.
- Made the default dashboard period the latest seven inclusive local calendar dates and removed the no-run early return that previously hid persisted manual imports.
- Made dashboard loads read-only: they never call OpenAI. Stored synthesis is reused only when its date scope exactly matches the default window, and its exact included episode set is compared with the current eligible set to expose staleness.
- Added explicit Generate/Regenerate synthesis actions. Synthesis Structured Output now constrains evidence IDs to the supplied corpus, disallows multi-creator labels for single-creator input, and derives creator counts from cited database evidence.
- Added `npm run diagnose:persistence`, a read-only consistency report for completed attempts, transcript/episode links, insight/episode links, extraction audits, and required states.
- Verified the hosted corpus through the real dashboard, explicitly generated and persisted a grounded synthesis, and reloaded the page three times with the same stored report and no automatic synthesis call.
- Verified 77 TypeScript tests, 66 pgTAP assertions, ESLint, TypeScript, the production Next.js build, and a clean migration reset.

- Hardened all dashboard date formatting behind a shared invalid-date-safe formatter; missing or malformed publication timestamps now render as `Date unavailable` instead of throwing `RangeError: Invalid time value`.
- Centralized the absent chat-scope fallback as Last 7 days across the UI, API route, and research service.
- Added regression coverage for null, undefined, empty, malformed, `NaN`, and invalid `Date` values; verified 73 TypeScript tests, ESLint, and TypeScript.

- Replaced parallel chat insight/split citation arrays with one canonical `RetrievedEvidence` contract and stable `insight:<uuid>` evidence IDs supplied to the answer model.
- Made every generated finding require at least one structured evidence ID and validate every cited ID against the exact retrieved evidence set; provenance validation remains strict.
- Added one bounded answer repair attempt containing the validation error and allowed evidence IDs; a second invalid result is rejected and the UI retains the question for retry.
- Rewrote answer instructions to prohibit general-model knowledge as evidence, preserve historical time context, distinguish consensus/disagreement, and return explicit insufficient-evidence results.
- Added compact This week, Last 7 days, Last 30 days, This season, All history, and Custom chat controls, defaulting to Last 7 days.
- Defined This week as Monday through Sunday in the browser's local timezone and configured This season through `FPL_SEASON_START_DATE` / `FPL_SEASON_END_DATE`.
- Applied UI scope separately from query interpretation; question-implied dates can narrow but never silently broaden the selected boundary.
- Kept retrieval on `episodes.published_at`, ranked/capped through the existing Postgres function, and added a same-period keyword-only fallback without expanding dates or other filters.
- Returned readable creator, episode, publication date, and source links in chat while keeping evidence IDs internal to the primary UI.
- Verified hosted read-only retrieval across Last 7 days, This season, All history, and a known Custom day; all scopes found the expected 12 real insights from the real `GW3 Preview` episode where applicable.
- End-to-end real-data chat checks passed: Last 7 days produced four cited findings with an evidence limitation, This season correctly reported no Saka evidence, All history cited the single supported value claim without inventing repetition, and the August 7 Custom scope produced four cited transfer-debate findings.
- Verified 71 TypeScript tests, ESLint, TypeScript, and the production Next.js build after the chat reliability changes.

- Removed demo research from the normal database lifecycle: default Supabase seeding is disabled and the deterministic fixture now lives under the database test suite only.
- Audited the hosted project by exact immutable demo IDs across sources, episodes, transcripts, insights, relationships, splits, and summaries; all matching hosted counts were already zero and the real `GW3 Preview` episode remained present.
- Added and deployed an idempotent, fail-closed cleanup migration targeting only the confirmed demo IDs and seed identity markers.
- Replaced per-insight summary output with a structured editorial FPL intelligence report containing a 2–4 paragraph overview and optional team, transfer, discussion, fixture, chip, value, poor-value, and watchlist sections.
- Added explicit POSITIVE, MIXED, NEGATIVE, and NEUTRAL report sentiment plus creator-claim/consensus/disagreement evidence rules and validated distinct-source counts.
- Added entity relationships and episode publication dates to synthesis input while continuing to use persisted structured insights rather than raw transcripts.
- Removed the top-level atomic-insight dump and UUID labels from the report UI; report evidence now shows creator, episode, publication date, and source link.
- Preserved atomic insights, entities, transcript evidence, extraction records, and split decisions unchanged as the permanent corpus; only the derived report contract and presentation changed.
- Verified 62 TypeScript tests and 65 pgTAP assertions, ESLint, TypeScript, a clean no-demo database reset, the production Next.js build, and hosted post-cleanup counts (0 demo sources, 1 real episode, 12 real insights).

- Added repository-level contributor guidance in `AGENTS.md`.
- Documented the fixed product purpose, architecture, data model principles, processing guarantees, MVP interface, and engineering workflow.
- Initialized a minimal Next.js App Router application with TypeScript and ESLint.
- Added a simple FPL Research homepage that reports server-side Supabase status.
- Added a server-only Supabase client using the current secret API key pattern.
- Added `GET /api/health` to verify Supabase connectivity.
- Added understandable missing-credential and connection-error responses without exposing secrets.
- Added `.env.example` and exact local setup instructions in `README.md`.
- Installed dependencies and generated `package-lock.json`.
- Verified lint, TypeScript, production build, homepage loading, and missing-credential behavior.
- Verified the application on Node.js 22.22.0 against the configured Supabase project.
- Verified the homepage and `GET /api/health` both return HTTP 200 with a successful Supabase connection.
- Verified the Supabase secret key is absent from homepage and health responses and from browser static assets.
- Added a versioned Supabase migration defining the initial 13-table FPL research schema.
- Added Postgres enums and constraints for closed state sets and invalid numeric/time ranges.
- Added restrictive historical foreign keys, idempotency constraints, query indexes, and automatic `updated_at` triggers.
- Enabled RLS on every application table with access granted only to the privileged server role; no browser policies exist.
- Added deterministic, idempotent fake seed data covering sources, checkpoints, a completed run, episodes, transcripts, entities, insights, a split decision, positions, provenance links, and a run summary.
- Added server-only `listSources` and `listEpisodes` data-access helpers.
- Added a pinned project-local Supabase CLI and local database lifecycle scripts.
- Added pgTAP tests for schema presence, seed loading, episode idempotency, and split-decision provenance relationships.
- Verified a clean local database reset, seed load, 10 passing database tests, successful Data API source/episode/relationship queries, and a clean database lint.
- Added `EpisodeDiscoveryProvider` and `EpisodeProcessor` boundaries with deterministic fake implementations.
- Added a server-only Supabase processing repository and orchestration service.
- Added `POST /api/processing-runs` with conflict handling for an already-running run.
- Added enabled-source loading, checkpoint reading, episode upsert, retry-candidate loading, run-episode creation, legal state transitions, run finalization, and monotonic checkpoint updates.
- Added a database-enforced single-running-run constraint and guards against illegal episode-state transitions and backward checkpoints.
- Added deterministic TypeScript tests proving partial failure, retry recovery, completed-episode skipping, duplicate discovery handling, and exactly-once episode identity.
- Expanded pgTAP coverage to 12 tests for the orchestration database guards.
- Verified the POST endpoint twice against local Supabase: Run 1 became `PARTIAL`; Run 2 retried C, added D, and became `COMPLETED` with no duplicate episode identities.
- Replaced the health-only homepage with one responsive dashboard containing Processing, Latest run, and Ask FPL Research sections.
- Added a server-only dashboard read model and `GET /api/processing-runs` status endpoint returning only display-safe run data.
- Added a Process new episodes button that invokes the existing orchestration endpoint and polls durable run progress without duplicating processing logic.
- Added live enabled-source count, last-run time, run status, active source names, discovered/completed/failed counts, and per-episode states.
- Added prominent failure presentation with persisted episode error messages.
- Added latest-run source/title/status rows and an explicit synthesis placeholder.
- Added disabled historical-query controls with clear future-milestone messaging.
- Added durable in-run counter updates so polling reflects discovery and completion progress before finalization.
- Verified the full two-run incremental flow in the browser against local Supabase with no browser console errors.
- Added a provider-neutral `TranscriptProvider` contract with normalized text, language, duration, provider, and optional timestamped segments.
- Added `ManualTranscriptProvider` for pasted development transcripts and a deterministic `FakeTranscriptProvider` for automated tests.
- Removed the temporary manual transcript dashboard form and endpoint after adopting the local validation CLI; no transcript-entry product UI remains.
- Added SHA-256 content hashing, durable transcript upsert behavior, optional duration/segment storage, and episode-duration updates.
- Updated orchestration to reuse existing transcripts, complete the transcript-only milestone without extraction, and retry acquisition failures on later runs.
- Added a migration permitting the transcript-ready-to-completed transition while retaining the future extraction path.
- Verified in the browser that a missing transcript fails clearly, a pasted transcript persists, and the failed episode completes on the next run while other failures remain retryable.
- Added four passing TypeScript tests covering manual normalization, understandable missing-input errors, partial recovery, duplicate prevention, and transcript reuse.
- Added a strict versioned FPL insight schema covering the requested taxonomies, entities, roles, tags, evidence, timestamps, and gameweek ranges.
- Added a server-only OpenAI Responses API extractor using `responses.parse` and `zodTextFormat`; free-form JSON parsing is not used.
- Added version-controlled extraction instructions with explicit rules against invention, irrelevant chatter, repetition, and cross-creator synthesis.
- Updated processing to transition through `EXTRACTING`, persist only validated complete results, record failures, and retry failed episodes.
- Added an atomic Postgres extraction function that inserts insights, reuses or creates exact canonical entities, links roles, and rolls back the entire extraction on an invalid row.
- Added extraction model, extraction index, prompt version, and tags to insights, with database-enforced taxonomy constraints and retry uniqueness.
- Added representative fixtures for buy, sell, rotation, captaincy, fixtures, price speculation, within-episode conflict, and irrelevant chatter.
- Expanded validation to seven TypeScript tests and 21 pgTAP assertions, including malformed-output rollback and retry duplicate prevention.
- Verified the production workflow reaches OpenAI with a manually stored transcript; the configured template API key was rejected before any insights were written.
- Added `scripts/import-test-transcript.ts`, a local-only CLI accepting source, title, publication date, URL, optional gameweek, and a `.txt` transcript path.
- Added a reusable development import service that creates or reuses sources and episodes, uses existing transcript normalization/hash/storage, invokes the existing OpenAI extractor, and persists via the existing atomic extraction function.
- Added stable development source/episode identities and extraction-version checks so identical reruns reuse records and skip another OpenAI call.
- Added `npm run import:test-transcript`, terminal success/failure summaries, `.env.local` loading, argument validation, and command help.
- Added the ignored `test-transcripts/` workspace folder so real transcript contents are not committed accidentally.
- Expanded TypeScript tests to nine, including first-import persistence, repeated-import idempotency, extraction-call skipping, and empty-file rejection.
- Removed the extraction model fallback: `OPENAI_EXTRACTION_MODEL` is now mandatory, syntactically validated, and passed unchanged to the Responses API.
- Added secret-free structured logs for successful and failed extractions with model, episode ID, extraction version, timestamp, and available input/output/total token usage.
- Added an `episode_extractions` audit table storing one model/usage record per episode and extraction version, including successful zero-insight extractions.
- Updated atomic extraction persistence so insights, entity links, and token usage commit or roll back together.
- Updated development-import idempotency to use the episode extraction audit rather than requiring at least one insight.
- Expanded configuration, audit-log, and database coverage for missing/invalid models, exact model selection, usage persistence, and malformed-extraction rollback.
- Added a versioned Structured Outputs split detector that compares new insights with relevant historical insights sharing entities or FPL categories.
- Added strict split-decision and position schemas with stable idempotency keys, explicit category/time horizon, reasoning, unresolved questions, implications, and supporting insight IDs.
- Added detector rules that reject topic overlap alone, same-conclusion/different-reasoning cases, invented evidence IDs, shared evidence across opposing positions, and candidates without support from at least two creators.
- Integrated split detection after successful episode extraction through the existing processing-run engine; detection failures make the run partial without rolling back completed episodes.
- Added a per-insight, versioned split-detection ledger so failed passes remain retryable and successful no-split evaluations are not repeatedly sent to OpenAI.
- Added an atomic Postgres function that upserts decisions and positions, appends provenance links through `split_position_insights`, and records evaluated insights without duplicating derived records.
- Updated the seed data for stable split keys and detector audit metadata.
- Added deterministic coverage for BUY versus AVOID, HOLD versus SELL, captain A versus captain B, nuanced time horizons, same conclusions with different reasoning, insufficient cross-creator evidence, invalid evidence reuse, retry recovery, and database idempotency.
- Added a versioned Structured Outputs run-summary generator that receives structured insights and split decisions only; raw transcripts are never included.
- Added the nine requested report areas: overview/key developments, strongest transfers, negative player views, captaincy, fixtures, minutes/injuries/rotation, price/value, chips/wildcard, and split decisions.
- Required every material synthesis statement, including the overview, to label itself as a creator claim, consensus, or disagreement and cite supporting insight IDs.
- Added server-side validation that rejects unknown insight/split IDs and prevents consensus or disagreement labels without multi-creator evidence.
- Added successful-episode-only partial-run synthesis context, with failed episode names and errors retained separately for clear dashboard disclosure.
- Integrated synthesis after split detection in the existing processing engine; synthesis failure does not roll back completed episodes and produces a partial processing result.
- Extended `run_summaries` with validated JSON, model, and token-usage audit fields plus an idempotent atomic upsert function.
- Expanded the Latest Run dashboard with processing results, synthesis sections, interpretation labels, evidence links, key atomic insights, exact split questions, positions, supporting creators, reasoning, unresolved implications, and source-episode links.
- Verified the seeded multi-creator report in the browser with nine source links and no console errors.
- Verified 21 TypeScript tests, 38 pgTAP assertions, ESLint, TypeScript, production build, and Supabase schema lint.
- Added a versioned Structured Outputs query interpreter covering player/team entities, categories, creators, explicit or implied date ranges, gameweeks, keywords, result limits, chronology, current-decision ranking, split focus, and transcript-evidence usefulness.
- Added indexed Postgres retrieval over the entire historical corpus using entity relations, categories, creators, publication dates, gameweeks, and full-text search; no default recency cutoff is applied.
- Added recency-aware ranking for current-decision questions without excluding old evidence, plus chronological ordering for sentiment and change-over-time research.
- Added relevant split-decision retrieval and automatic hydration of every supporting atomic insight so split-only answers retain episode provenance.
- Added a second schema-constrained OpenAI answer stage that receives retrieved records only and cannot cite unknown insight or split-decision IDs.
- Added grounded answer structures for direct answers, consensus, disagreements, reasoning, time horizons, and changes over time, with explicit insufficient-evidence handling.
- Added `POST /api/research-query` with question validation and server-only OpenAI/Supabase access.
- Activated the Ask FPL Research interface with local answer history, loading/error states, evidence classifications, and deduplicated source-episode links.
- Added month-separated historical retrieval fixtures proving older records remain available, current ranking does not impose a date cutoff, combined database filters work, and split-focused questions return their underlying sources.
- Verified 25 TypeScript tests, 44 pgTAP assertions, ESLint, TypeScript, production build, Supabase schema lint, and the enabled chat controls in the browser without client errors.
- Added a real `YouTubeEpisodeDiscoveryProvider` behind the existing provider contract; the processing engine now reads public YouTube channel feeds without creator-specific branches.
- Normalized video IDs, titles, canonical video URLs, publication timestamps, and nullable duration into the existing episode metadata contract.
- Reused the existing timestamp/external-ID checkpoint comparison and retained database uniqueness as the final duplicate guard.
- Configured Let's Talk FPL and The FPL Wire as enabled database source records with immutable YouTube channel IDs; fictional research fixtures remain separate and disabled.
- Preserved per-source failure isolation in the existing run engine and added coverage proving a failed source is logged while later sources are still checked.
- Added deterministic tests for two configured channels, checkpointed no-duplicate reruns, a simulated newer upload, malformed configuration, and source-specific HTTP failures.
- Added a read-only live verification command and confirmed both real feeds returned 15 episodes on the first pass and zero after an immediate checkpointed pass.
- Verified 29 TypeScript tests, 48 pgTAP assertions, ESLint, TypeScript, production build, and a clean local migration/seed reset.
- Added a server-only `SupadataTranscriptProvider` behind the existing normalized `TranscriptProvider` contract.
- Added configuration-driven provider selection through `TRANSCRIPT_PROVIDER`, with `SUPADATA_API_KEY` required only for Supadata and manual fallback retained for development.
- Implemented the current Supadata universal transcript endpoint with URL-based acquisition, `x-api-key` authentication, automatic native/AI mode, timestamp preservation, language normalization, derived duration, and bounded asynchronous job polling.
- Added normalized transient, permanent, and configuration failures; rate limits, timeouts, network failures, and 5xx responses retry at most three times while unavailable/private/invalid videos fail immediately within the run.
- Kept transcript reuse, SHA-256 hashing, permanent storage, provider provenance, extraction handoff, per-episode isolation, and later-run retry behavior in the existing processing engine and repository.
- Added mocked coverage for plain text, timestamped segments, unavailable and invalid videos, transient recovery/exhaustion, malformed responses, async jobs, configuration, stored-transcript reuse, and one-episode failure isolation.
- Verified 40 TypeScript tests, ESLint with no warnings, TypeScript, production build, and that Supadata credentials/endpoints are absent from generated browser assets.
- Replaced the split detector's growing PostgREST ID-filter chain with `load_split_detection_context`, a scalar-parameter database function keyed by `run_id` and detection version.
- Bounded split processing to explicit batches while leaving unevaluated insights available for a later run; successful ledger entries remain idempotent.
- Added fixed-size batching for remaining summary, dashboard, and retry-history PostgREST ID filters, with a 2,000-ID regression fixture proving URLs remain bounded.
- Deduplicated extracted entity relationships by type, case-normalized canonical name, and semantic role before persistence, merging aliases without collapsing genuinely different roles.
- Hardened the atomic extraction function with the same normalization plus semantically safe conflict handling; repeated persistence remains guarded by `episode_extractions`.
- Added append-only `processing_failures` records containing run, optional episode, stage, message, retryability, and timestamp.
- Persisted episode acquisition/extraction/persistence failures separately from run-level split, synthesis, source, and finalization failures.
- Kept episode processing isolated when failure-state persistence itself errors, and retained completed transcripts, insights, and episodes when derived processing fails.
- Made derived-report dashboard loading non-fatal so episode statuses and run failures remain visible even if synthesis/split hydration fails.
- Added error stage, retryability, run-level errors, and remaining-work counts to the existing processing UI.
- Made the OpenAI SDK's bounded two-retry exponential-backoff policy explicit for extraction, split detection, and synthesis; invalid structured outputs and persistence defects are not retried.
- Verified 43 TypeScript tests, 55 pgTAP assertions, ESLint, TypeScript, production build, clean database reset, and database lint.
- Added persisted `CANCELLING` and `CANCELLED` processing-run states with a single-active-run database guard and a cancellation-request timestamp.
- Added `POST /api/processing-runs/cancel`; cancellation is cooperative and checked between sources, between episodes, before transcript acquisition, before extraction, and before downstream split processing.
- Preserved completed work when stopping, marked queued run episodes as `CANCELLED`, retained checkpoint safety, and made cancelled/incomplete episodes eligible for a later incremental run without duplicating episodes, transcripts, or insights.
- Removed automatic synthesis from ingestion. Processing, polling, and page refreshes no longer invoke synthesis or make an OpenAI synthesis call.
- Added explicit `POST /api/syntheses` actions for the latest eligible processing run and for an inclusive episode-publication date range across processing runs.
- Added run/date-range synthesis scope metadata, exact included-episode provenance, generation model/prompt/token auditing, and append-only explicit regenerations.
- Added durable synthesis attempts with independent `RUNNING`, `COMPLETED`, and `FAILED` states and clear retry behavior that does not rerun ingestion or extraction.
- Updated the dashboard with Stop processing, stop-requested/cancelled states, completed/failed/not-processed counts, explicit latest-run and date-range synthesis controls, scope/inclusion disclosure, and synthesis failure messages.
- Verified a clean migration/seed reset, 45 passing TypeScript tests, 55 passing pgTAP assertions, ESLint, TypeScript, and the production Next.js build.
- Audited the linked hosted project and found 1 episode, 1 transcript, 12 correctly linked insights, 0 processing runs, 0 run episodes, and 0 extraction-audit rows; no additional previously processed episodes exist in that configured project.
- Removed latest-processing-run membership as the data source for the dashboard's editorial content; processing status remains run-based while Latest Transcripts is loaded independently from persisted episodes.
- Added a default seven-calendar-day view using `episodes.published_at`, newest-first ordering, creator, publication date, derived processing status, and persisted insight counts.
- Added a real empty state with no seed/demo substitution and a same-window analysis list hydrated from persisted insights linked through `insights.episode_id`.
- Corrected date-range synthesis to include episodes with persisted insights across every run and manual imports; the empty `episode_extractions` audit ledger no longer suppresses valid historical insights.
- Added browser-local timezone offsets to dashboard and synthesis requests and converted inclusive local date selections to safe UTC start-inclusive/end-exclusive bounds.
- Added timezone-midnight, seven-day-window, cross-run/manual-import, historical-period, and no-demo-fallback regression coverage.
- Verified against hosted data that the seven-day dashboard returns `GW3 Preview` with 12 insights and that an August 7 local date range retrieves the episode and all 12 insights without an OpenAI call.
- Added compact From, To, and Max YouTube videos per creator controls to the Processing section, defaulting to the latest seven local calendar days and three videos per creator.
- Added a validated `ProcessingRunOptions` contract with centralized defaults and a hard safety maximum of 20 YouTube videos per creator.
- Converted browser-local date selections to inclusive-local-day, start-inclusive/end-exclusive UTC discovery boundaries before source discovery.
- Changed scoped YouTube discovery to filter by publication timestamp rather than checkpoint position; existing external episode IDs and completed attempt history remain the deduplication authority.
- Applied the YouTube cap independently per source after date filtering, upsert/deduplication, and completed-history removal, with newest eligible unprocessed videos selected first.
- Applied selection before transcript acquisition and OpenAI extraction, and left non-YouTube sources unconstrained by the video-specific cap.
- Preserved checkpoint cursors during scoped runs while updating `last_checked_at`, preventing capped, stopped, failed, or older in-window items from being hidden from later runs.
- Persisted discovery start/end, YouTube creator limit, selected count, and deferred count on each processing run and exposed the active/latest configuration in processing status.
- Added regression coverage for timezone conversion, invalid ranges/limits, newest-first caps, per-creator independence, non-video behavior, pre-transcript cost control, deferred backlog draining, persisted options, scoped cancellation recovery, and repeated-run idempotency.
- Verified 55 TypeScript tests, 61 pgTAP assertions, ESLint, TypeScript, production build, clean local reset, and database lint.
- Reproduced `cannot extract elements from a scalar` against the pre-fix database with a valid entity containing `aliases: []`; PostgreSQL identified the failing entity-insert array expansion.
- Identified the regression in the resilience migration's grouped entity normalization: an empty filtered `jsonb_agg` became JSON `null`, which SQL `coalesce` did not convert back to an array.
- Replaced the extraction RPC so empty alias aggregates are canonical JSON arrays and all `jsonb_array_elements*` calls receive validated arrays.
- Added database shape guards for extraction, insight, tags, entities, entity objects, and aliases, with episode ID, insight index, entity index, field, expected type, and received type in deterministic errors.
- Added a strict application persistence boundary that revalidates extraction results, deduplicates tags/entities/aliases, and sends only the canonical shape to Supabase.
- Kept extraction writes transactional: malformed multi-insight results leave no partial insights, entity relationships, or extraction audit records.
- Confirmed deterministic validation/schema/persistence-shape errors are non-transient, while explicitly transient provider/OpenAI failures retain bounded retry behavior.
- Confirmed one malformed episode does not stop other episodes and a later retry reuses its stored transcript rather than fetching it again.
- Verified 60 TypeScript tests, 65 pgTAP assertions, ESLint, TypeScript, production build, clean database reset, database lint, and the hosted repair migration.

## Known limitations

- Player-to-team membership is not represented in the current stored entity model. Team pages therefore show only insights explicitly linked to that team and do not infer or mix in every player insight; a “Players from this team” section remains deferred until trustworthy membership data exists.
- Search currently evaluates the 138 canonical entity/alias records server-side and returns at most 20 matches. This is appropriate for the personal-scale corpus; a dedicated indexed search RPC can replace it if the entity library grows materially.
- Potential normalization collisions remain for surname-only or ambiguous entities, including `Anderson` / `Elliot Anderson`, `Pedro` / `João Pedro`, `Ballard` / `Dan Ballard`, and ambiguous `Kinsky` records. They were not merged automatically because provenance-safe identity is uncertain.

- Existing historical insights are not automatically linked to transcript segments. A previously stored `timestamp_seconds` is still displayed when present; absent timestamps remain explicitly unavailable until the user chooses a future backfill/re-extraction milestone.
- Date-range preservation uses the current `from`/`to` URL parameters. The episode itself remains visible even when its publication date falls outside that retained explorer range because the episode page is addressed directly by ID.

- Specific-video entry supports YouTube only and resolves public page metadata without a YouTube API key. Removed, private, members-only, age-gated, or region-blocked videos can fail before an episode record can be created.
- Batch result links open the original YouTube episode because the MVP does not yet have a dedicated internal episode-detail page.
- Real transcript/OpenAI validation remains an explicit user-triggered paid operation; automated tests use deterministic providers and do not spend provider credits.

- Creator stance derives from the existing recommendation taxonomy. Explicit chronological changes are preserved and displayed as evidence, but the default selected-period stance remains MIXED; a context-specific “latest stance wins” mode is intentionally not inferred automatically.
- Creator aggregation is entity/category/time-horizon based and conservative. Insights without entity relationships fall back to their primary category rather than using fuzzy subject matching.

- Custom extraction instructions intentionally affect only future extractions. Historical re-extraction is not part of this milestone.
- Custom synthesis instructions intentionally do not regenerate existing reports; regeneration remains an explicit paid action.

- API cost figures are estimates based on centrally maintained standard token rates. They do not include regional-processing uplifts, Batch discounts, cache-write premiums, future pricing changes, or non-token tool fees.
- An overridden model with a syntactically valid but unknown model ID is passed unchanged to OpenAI and will fail with the provider's configuration error; it is not silently replaced. Its estimated cost remains null until pricing metadata is added.
- `ai_usage_events` is currently the internal/debugging surface in Supabase; no billing dashboard was added in this milestone.

- Adding creators currently supports YouTube only. The run-source snapshot is generic, but podcast/newsletter/social metadata resolvers are intentionally not implemented.
- YouTube channel metadata resolution relies on public YouTube channel pages and Atom feeds, so transient provider changes or outages can require retrying the add action.
- The hosted validation run completed both episode extractions but ended `PARTIAL` because existing split-decision model output contained overlapping evidence and was discarded by the established reliability guard; source selection and historical snapshots were unaffected.

- The configured hosted database contains no records for the earlier multi-episode runs the user expected. Those runs cannot be recovered from this project; they were either executed against another environment or did not persist here.
- Staleness behavior is covered deterministically in tests. The hosted project was not polluted with a fake second episode solely to demonstrate the stale banner.

- The hosted corpus currently has only one real episode from one creator, so multi-creator consensus, repeated recommendations, and sentiment change cannot be demonstrated honestly; chat now reports that insufficiency rather than broadening scope or inventing support.
- Broad role questions such as "best midfield transfers" are limited by the current stored entity model, which identifies players and teams but does not store player positions; the answer can still disclose the limitation, but precise position filtering will require richer entity metadata or future live FPL data.

- The public YouTube feed exposes only a bounded recent-upload window and does not provide video duration, so duration is stored as null and very long gaps between runs may require a future API-backed discovery option.
- A selected processing range can only discover videos still present in YouTube's bounded public channel feed; widening the calendar range cannot recover items no longer exposed by that feed.
- Supadata production behavior is covered with mocked responses but has not been charged against a real Supadata account in this workspace session.
- Processing still runs inside one server request. The new stop control is cooperative, so the current external transcript/OpenAI request is allowed to finish safely before the run stops; an abrupt process/server termination is not equivalent to cooperative cancellation.
- Split detection processes at most 100 new insights with up to 250 relevant context records per pass; excess unevaluated insights remain eligible for a later run.
- The dashboard uses polling during active runs; no queue, background worker, or realtime subscription has been introduced.
- Chat history is held in the current browser session only; conversations are not persisted between page loads.
- Live Milestone 9 synthesis quality has not yet been validated across three to five real multi-creator transcripts; deterministic schema, orchestration, database, and seeded-browser behavior are validated.
- The linked hosted project currently contains only one manually imported transcript episode. The other transcripts the user expected are not present in this configured project and cannot be reconstructed from its current records.
- The configured hosted project contained no matching failed run episodes for the scalar regression, so real failed-episode reruns could not be performed there; the exact real-shaped payload was reproduced before the fix and passed after it locally.
- Application data is not exposed to browser clients; only the server-side secret client has database privileges at this stage.
- Authentication, embeddings, a vector database, autonomous agents, and queues are intentionally outside the initial scope.

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL` — required; public Supabase project URL.
- `SUPABASE_SECRET_KEY` — required; server-only Supabase secret API key (`sb_secret_...`).
- `OPENAI_API_KEY` — required for extraction, split detection, run synthesis, query interpretation, and research answers; server-only OpenAI project API key.
- `OPENAI_EXTRACTION_MODEL` — optional server-only extraction override; default `gpt-5.6-luna`.
- `OPENAI_QUERY_MODEL` — optional server-only query-interpretation override; default `gpt-5.6-luna`.
- `OPENAI_SPLIT_MODEL` — optional server-only split-detection override; default `gpt-5.6-luna`.
- `OPENAI_SYNTHESIS_MODEL` — optional server-only synthesis override; default `gpt-5.4-mini`.
- `OPENAI_CHAT_MODEL` — optional server-only grounded-answer override; default `gpt-5.4-mini`; repairs reuse the originating model.
- `FPL_SEASON_START_DATE` — required when using the chat's This season scope; inclusive `YYYY-MM-DD` season start.
- `FPL_SEASON_END_DATE` — required when using the chat's This season scope; inclusive `YYYY-MM-DD` season end.
- `TRANSCRIPT_PROVIDER` — required for processing runs; use `supadata` for production or `manual` for development fallback.
- `SUPADATA_API_KEY` — required only when `TRANSCRIPT_PROVIDER=supadata`; server-only Supadata API key.

## Database migrations applied

- The player/team explorer requires no new migration. It reuses `entities`, `aliases`, `external_fpl_id`, `insight_entities`, episode/source provenance, split relationships, and existing indexes.

- Local and linked Supabase: `20260809070000_episode_insight_provenance.sql` applied successfully. It normalizes existing/new timestamped transcript segments, adds restrictive insight evidence links, and transactionally validates future segment citations.

- Local and linked Supabase: `20260809060000_specific_url_batches.sql` applied successfully. It adds run-type/count audit columns and durable per-URL batch records with restrictive historical foreign keys and service-role-only access.

- Creator-level opinion aggregation requires no database migration; stable source identity and all supporting episode/insight evidence already exist, while report metrics remain derived in validated `summary_data`.

- Milestone 12 requires no database migration; existing transcript columns already store normalized content, provider provenance, timestamps, duration, and content hashes.

- Local database: `20260808120000_initial_fpl_schema.sql` applied successfully from a clean reset.
- Local database: `20260808130000_processing_orchestration_guards.sql` applied successfully from a clean reset.
- Local database: `20260808140000_transcript_acquisition.sql` applied successfully from a clean reset.
- Local database: `20260808150000_structured_insight_extraction.sql` applied successfully from a clean reset.
- Local database: `20260808160000_extraction_usage_audit.sql` applied successfully; all 25 pgTAP assertions pass.
- Local database: `20260808170000_split_decision_detection.sql` applied successfully from a clean reset; all 32 pgTAP assertions pass.
- Local database: `20260808180000_run_summary_synthesis.sql` applied successfully from a clean reset; all 38 pgTAP assertions pass.
- Local database: `20260808190000_historical_research_retrieval.sql` applied successfully from a clean reset; all 44 pgTAP assertions pass.
- Local database: `20260808200000_predefined_youtube_sources.sql` applied successfully from a clean reset; all 48 pgTAP assertions pass.
- Local database: `20260808205000_repair_split_detection_ledger.sql` safely repairs hosted schema drift where the split-detection migration was recorded but its ledger table was absent; it is a no-op on correct databases.
- Local database: `20260808210000_processing_resilience.sql` applied successfully from a clean reset; all 55 pgTAP assertions pass.
- Local database: `20260808220000_cancellation_states.sql` applied successfully from a clean reset; adds cancellation enum values.
- Local database: `20260808220100_processing_control_synthesis.sql` applied successfully from a clean reset; adds cancellation constraints, scoped synthesis records, exact episode provenance, and synthesis attempts.
- Local database: `20260808230000_processing_run_scope.sql` applied successfully from a clean reset; adds validated discovery scope, YouTube limit, selected count, and deferred count to processing runs.
- Local database: `20260808240000_fix_extraction_alias_arrays.sql` applied successfully from a clean reset; repairs empty aliases and adds precise extraction shape guards.
- Hosted Supabase project: migrations through `20260808240000_fix_extraction_alias_arrays.sql` applied successfully.
- Local and hosted Supabase: `20260808250000_remove_confirmed_demo_seed.sql` applied successfully; it removes only the immutable original demo fixture IDs and is a no-op where they are absent.
- Local and hosted Supabase: `20260809010000_persistence_guards_and_real_source_repair.sql` applied successfully; it repairs the audited temporary import identity and prevents incomplete extraction attempts from being marked completed.
- Local and hosted Supabase: `20260809020000_synthesis_eligibility_metadata.sql` applied successfully; it stores eligible/included counts, excluded episode reasons, and distinct creator counts for every new synthesis.
- Local and hosted Supabase: `20260809030000_selectable_source_library.sql` applied successfully; it adds persisted default source selection, immutable relational run-source snapshots, and atomic validated run creation.
- Local and hosted Supabase: `20260809030100_fix_source_selection_update_guard.sql` applied successfully; it makes the atomic preference update compatible with the hosted project's update guard.
- Local and hosted Supabase: `20260809040000_normalized_ai_usage.sql` applied successfully; it adds the normalized, service-role-only AI usage and estimated-cost ledger.
- Local and hosted Supabase: `20260809050000_ai_instruction_settings.sql` applied successfully; it adds protected fixed-key current settings, immutable version history, and an atomic idempotent writer.

## Next intended milestone

Improve entity normalization only where manually confirmed collisions materially affect browsing; live FPL team membership and historical timestamp backfill remain deferred unless explicitly requested.
