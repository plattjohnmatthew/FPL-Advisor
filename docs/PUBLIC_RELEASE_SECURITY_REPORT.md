# Public-release security and cost-abuse report

**Result: application acceptance PASS against the production build locally. Live production attestation remains pending.** No production configuration, DNS, cloud object, operational research or private settings were changed.

## Evidence

- Full suite: **282/282 passing**. Lint, typecheck, public/private production builds pass; production dependency audit reports zero advisories.
- **54 actual production-server HTTP checks**, including normal browsing, explicit retry/resume/pause/cancel/dismiss/settings requests, invalid queries, private files, HEAD/OPTIONS and image optimization. Every prohibited action failed; **zero prohibited external operations**. Largest inspected response: **212,871 bytes**.
- **16 real provider/adaptor entry attempts**, plus all **7 OpenAI task/repair wrappers**, reject public execution before transport, Python execution or audit-recorder callbacks. Tests also run with public squad display enabled; that read permission never grants processing permission.
- Secret scan: **21 browser artifacts, 54 generated HTML/network responses, the complete local archive and all proposed public objects**, compared with **3 known secret values, 2 actual saved custom instructions and 7 protected prompts**. No matches. Values were never printed. Fetching saved instructions was a private auditor SELECT, never a visitor operation.
- [HTTP evidence](public-deployment-checks.json), [secret audit](public-secret-audit.json), [complete endpoint inventory](public-endpoint-audit.json), [production dependencies](public-production-dependency-audit.json).

## Paid/external-effect call paths

| Paths | Public enforcement |
| --- | --- |
| `lib/insights/openai-extractor.ts`: extraction and citation repair | Guarded OpenAI environment; shared tracked-call guard before SDK operation |
| `lib/splits/openai-detector.ts`: split detection | Same guarded environment/tracked-call boundary |
| `lib/research/openai.ts`: interpretation, answer, repair | Same boundary; research POST denies before parsing or service creation |
| `lib/summaries/openai-generator.ts`: generation, reduction, repair | Up-front generation/identity guard, guarded environment and all tracked tasks |
| Supadata, local Python, manual resolver, transcript chain and audited wrapper | Provider-entry guards run before transport, process execution, fallback or ledger callback |
| YouTube discovery/channel resolution, official FPL registry and entry providers | Direct provider guards also prevent free external refresh/ingestion and its downstream work |
| Blob upload/activation/rollback | Private CLI only; capability and matching-store token checks; no upload endpoint exists |

All processing, URL import, creator ingestion, retry/resume, cancellation, synthesis, chat, settings and FPL refresh routes deny public mutation before body parsing, database access, scheduling or provider creation. Disabled calls cannot generate usage-ledger writes as a side effect.

## Endpoint classification

All GET routes also have HEAD handling. Full inventory records **50 route/method combinations** and **zero server actions**. Unknown routes/methods default to disabled.

| API route | Public classification |
| --- | --- |
| `/api/entities/search` GET | PUBLIC READ; at most 10 players + 10 teams |
| `/api/syntheses` GET | PUBLIC READ; one saved, validated briefing only |
| `/api/syntheses` POST | DISABLED IN PUBLIC |
| `/api/processing-runs` GET/POST | DISABLED IN PUBLIC |
| `/api/processing-runs/url-batch` POST | DISABLED IN PUBLIC |
| `/api/processing-runs/cancel` POST | DISABLED IN PUBLIC |
| `/api/episodes/[episodeId]/processing` POST | DISABLED IN PUBLIC, every action |
| `/api/sources` POST/PATCH | DISABLED IN PUBLIC |
| `/api/research-query` POST | DISABLED IN PUBLIC |
| `/api/prompt-settings` PUT/DELETE | DISABLED IN PUBLIC |
| `/api/fpl-sync`, `/api/fpl-squad` POST | DISABLED IN PUBLIC |
| `/api/health`, `/api/research-health` GET | DISABLED IN PUBLIC |

Overview, Intelligence/history/details, player/team/episode research, fixtures, sanitized Sources, Ask's non-executing interface and How it works are PUBLIC READ. Personal analyses are PRIVATE. Squad is conditional PUBLIC READ and currently **disabled/403**, because no squad was approved/published. Private CLI tools are not web endpoints. Public snapshot writes, RPCs (including GET RPCs), operational insert/update/delete and settings saves were attempted directly and failed without fetch.

## Cost/size protections added

- Public image optimization is denied; public assets use normal static delivery.
- Public CDN responses advertise 60-second shared caching and 120-second stale revalidation; Next's cache variants remain intact. Prefilled Ask questions are excluded from shared caching. Header enforcement is verified locally; actual Vercel HIT behavior remains a live promotion check. [Caching reference](https://vercel.com/docs/caching/cache-control-headers).
- URLs ≤4,096 characters; route-specific parameter allowlists, no duplicates, bounded values, UUID validation and public pages 1–1,000. No caller-controlled projection, table, page-size or bulk-export API.
- Intelligence/history remain fixed at 20/10 items. Public entity/episode evidence is capped at 100 claims with an honest truncation notice; private histories remain complete. Saved briefing publication/read budgets cap citations at 200, split decisions at 20 and report JSON at 262,144 characters.
- Public Blob publication uses a manifest with **no insight rows**, plus immutable chunks of **at most 100 insights**. The complete local archive is not web-served. Digest/count checks, streaming byte bounds, a 25 MiB total snapshot budget and bounded parallel chunk reads protect ingestion. Repeated downloads can reconstruct intentionally published research; no secrecy is promised for public data.
- Immutable local versions, bounded per-version query caches, deduplicated remote loads, 60-second version caching and outage retry cooldown reduce repeated work. A previously validated version can remain readable during a storage outage. Title wildcard matching no longer constructs a backtracking regex from visitor text.
- No public Supabase connection exists: the operational client throws in public mode. The query-builder-shaped public client has an immutable local transport. No public RLS grants, credentials or INSERT/UPDATE/DELETE permission are needed.

## Acceptance and remaining release conditions

The tested candidate satisfies research browsing, processing/synthesis/chat/FPL denial, private-write isolation, credential-free public operation, independent data publishing and shared Git/Vercel code deployment. No provider calls occur while browsing the tested player, team, episode, briefing and overview pages. Squad remains safely unavailable until explicitly approved; its provider/write boundaries are still tested with its display flag enabled.

**Before live promotion:** use [PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md) to verify the actual project environment contains no paid/write secrets, publish chunked data to a fresh prefix and test the protected preview. If old monolithic public snapshots exist, archive them privately and have the owner retire those public copies; the new format cannot retroactively restrict an old public file. Old transport/code rollback compatibility must be reviewed. No live Blob upload, legacy-object retirement or authenticated Vercel environment inspection was performed here.

Ordinary CDN transfer, object-storage reads and bounded page/function delivery remain billable. Random valid requests and cold instances cannot be made free by application code. Account-level traffic/spend protections were not changed or attested; review the host's applicable controls. Vercel documents plan restrictions and delayed budget enforcement, so this report does **not** promise a hard zero-cost ceiling. [Spend-management reference](https://vercel.com/docs/spend-management).

## Repeat the audit

Run `npm test`, lint and typecheck; build with `FPL_NEXT_DIST_DIR=.next-public-check` using `npm run build:public`; then run `npm run check:public-http`. Finally, in the private local environment run `npm run audit:public-secrets` and `npm run audit:public-endpoints`. The secret auditor requires the private Supabase configuration only to compare saved instructions; public builds/runtime do not.
