# Publishing public research

For independent code/data releases and production setup, use [PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md). `publish:public` generates local files; `publish:public-data` generates and uploads a remote data release without a Git push or app build.

The private application is the source of truth. Public requests use files only: operational Supabase → explicit local export → allowlist sanitization and validation → immutable JSON version → atomic current pointer → public Next.js deployment.

## Generate locally

From the private checkout with the normal private `.env.local`:

```powershell
$env:APP_MODE='private'
npm run publish:public
```

The command pages through explicit SELECT columns, includes only episodes with saved transcripts/insights and a completed latest processing attempt (or legacy imports without an attempt), and includes valid completed briefings. All supporting evidence/relationships must validate. It never writes operational data or calls OpenAI, transcript providers, Python or FPL endpoints. Operational data can continue to change; a concurrent change that produces a dangling relationship fails publication safely. Rerun after processing settles.

Output: `data/public-snapshots/<UUID>.json` and `current.json`. Immutable versions are retained. The publisher validates before writing the version, then replaces the pointer by a same-directory atomic rename. Failed export/validation leaves the previous pointer untouched. A failed pointer replacement may leave an unused complete version; it cannot expose a partial snapshot. Concurrent successful publishers are last-pointer-wins; each version is complete.

Metadata includes schema version, snapshot ID, generated time, latest episode publication, latest briefing generation and counts. Current corpus is about 2 MB: 63 episodes, 982 insights, 9 briefings, 670 players, 20 teams and 13 creators at initial publication. Actual counts/bytes print on every run. Full export is intentionally simpler than incremental publishing.

## Public local preview

```powershell
$env:APP_MODE='public_read_only'
npm run dev
```

No database/API/provider credentials are needed. Missing or invalid snapshots produce an honest unavailable state. No database fallback exists. Build and runtime modes must match. Local JSON may be packaged by output tracing for local/offline use; production instead sets PUBLIC_SNAPSHOT_BASE_URL to the public Blob directory. Generated files are ignored by Git. Use the independent local upload command and production setup in PUBLIC_DEPLOYMENT.md; never regenerate or upload research inside a public request or public code build.

## Public contract

Published: creators, processed episodes, extracted claims/reasoning, evidence snippets (at most 2,000 characters each), timestamps/original URLs, canonical associations, saved reports/findings, split positions/evidence, official player/team metadata, prices and fixtures. Briefing cache identities/internal metadata are removed through the validated report schema. Transcript rows contain existence metadata only; there is no raw transcript export option in this milestone. Full transcript publication would require an explicit new opt-in contract.

Excluded: raw transcript text/segments, processing errors, retry state, provider records, usage/costs, settings, prompts/instructions, configuration, credentials, operational runs, saved personal AI analyses and personal squad data by default. The optional, explicit squad publishing/display flags are described in PUBLIC_SHOWCASE.md; the generated snapshots for this milestone contain no squad.

The schema uses table/column allowlists, scalar checks, relationship/citation validation, duplicate identity checks and credential-pattern/known environment-secret scanning. It is a publishing contract rather than an unrestricted database dump. Review content before publication; heuristics cannot prove every arbitrary natural-language string contains no sensitive information.

`createResearchDataClient` selects the existing private client or the file-backed public reader. A small local query adapter reuses the installed query builder's nested selects, filters, ordering, exact counts and pagination. The query adapter rejects unknown tables, unsupported filters, writes and RPCs. The remote snapshot loader uses unauthenticated GETs to the configured public Blob store only, with validated pointer/digest and a bounded cache; it never falls back to the operational database. Each client pins one immutable snapshot. Public visitors receive only each page/API's normal bounded results, not the full corpus. Existing page/component logic is shared.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. Snapshot tests cover field exclusion, credential rejection, orphan relationships, nested evidence filters/pagination, immutable history and failed-publication recovery. `docs/public-snapshot-read-checks.json` records actual corpus reads with global external fetch forbidden. Review the public edition locally before deploying.

## Public transport bounds

Local immutable archives remain complete JSON. Remote publication uploads at most 100 insight records per immutable static object plus an integrity-checked manifest containing metadata and no insight rows. Every chunk has a digest/count; no caller chooses table projections or page sizes. The reader validates/reassembles one bounded snapshot, deduplicates concurrent loads and caches it. Legacy public bulk objects require the explicit migration in PUBLIC_DEPLOYMENT.md. Repeated downloads can still reconstruct intentionally public research; this is a per-request/compute bound, not secrecy for published data.
