# Public and private research boundary

**Current architecture:** Public runtime reads generated snapshots exclusively, from local files or the configured public object-storage URL. No public Supabase role, token, publishable key, or connection is used. See [deployment](PUBLIC_DEPLOYMENT.md) for independent data publishing; only the local publisher holds a Blob write token. See [Public snapshots](PUBLIC_SNAPSHOTS.md). The initially implemented database-reader path was replaced before deployment; no reader-role migration is required.

One Next.js codebase serves two separately built deployments. `APP_MODE=private` (the default for existing local installs) retains authoring. `APP_MODE=public_read_only` serves stored research. Invalid values fail closed. This mode is trusted server configuration, never a request parameter or browser preference. Build and run each deployment with the same mode; rebuild when changing modes. Do not put the private deployment on the public website.

## Capabilities and enforcement

`lib/app-config.ts` owns mode, capabilities and the public request allowlist. The server passes only capability booleans and mode through `CapabilityProvider`; no credentials reach client components. All processing, generation, AI, refresh, settings, write and retry capabilities are false publicly. Squad publication/display remain false by default; the explicit optional snapshot/display flags are documented in PUBLIC_SHOWCASE.md.

Protection has several layers:

1. `proxy.ts` defaults to denying every public request except explicitly listed GET/HEAD research pages and APIs. POST server actions and new endpoints are denied automatically. Static Next assets and bundled fonts remain available.
2. Each existing mutation handler checks its capability before parsing bodies, constructing services, reserving runs or scheduling `after` work. Operational GET handlers are also denied. Operational pages check before loading data.
3. OpenAI environment access and the shared tracked-call wrapper reject public execution. Both real transcript providers reject before network/Python execution, including when supplied injected transports.
4. The public data client only reads snapshot files. It rejects all writes and RPCs, including GET RPCs. Operational Supabase construction is forbidden.
5. Public deployments contain no database credentials. Bypassing the file query adapter cannot grant access to the operational database.

## Pages

The showcase milestone restores visible product affordances while keeping all backend capabilities disabled. Overview, Intelligence, briefings, player/team/episode research, fixtures, Ask AI's interface, sanitized Sources and conceptual How it works are public. `/squad` requires the explicit display flag and published data. Personal analyses remain hidden. Restricted controls use the reusable gate and never issue backend work. See [showcase contract](PUBLIC_SHOWCASE.md).

## Route audit

| Route | Methods protected | Effects prevented |
| --- | --- | --- |
| `/api/processing-runs` | POST, operational GET | Discovery, transcript acquisition, extraction, splits, run writes |
| `/api/processing-runs/url-batch` | POST | URL ingestion and all downstream processing |
| `/api/processing-runs/cancel` | POST | Cancellation writes |
| `/api/episodes/[episodeId]/processing` | POST | Retry/resume/pause/dismiss actions, transcript/extraction work |
| `/api/sources` | POST, PATCH | YouTube resolution, creator ingestion and selection writes |
| `/api/syntheses` | POST | Briefing generation, reduction, repair, persistence |
| `/api/research-query` | POST | Interpretation, answers, repairs, analysis persistence |
| `/api/fpl-sync` | POST | Official FPL calls, registry/fixture/price writes |
| `/api/fpl-squad` | POST | Official FPL refresh, selection reconciliation, squad writes |
| `/api/prompt-settings` | PUT, DELETE | Settings and version-history writes |
| `/api/health`, `/api/research-health` | GET | Operational diagnostics |

Allowed APIs are GET/HEAD `/api/entities/search` and `/api/syntheses` (stored reports only). There are no existing server actions. Future public routes require an explicit allowlist change and review of their read behavior.

Paid call sites: `lib/insights/openai-extractor.ts` (extraction and citation repair), `lib/splits/openai-detector.ts`, `lib/summaries/openai-generator.ts` (synthesis, reduction and repair), `lib/research/openai.ts` (interpretation, answer and repair), all through `lib/openai/usage.ts`. Supadata calls are in `lib/transcripts/supadata-provider.ts`; Python execution in `lib/transcripts/youtube-local-provider.ts` invokes `scripts/youtube_transcript_bridge.py`. Authoring services and the manual import script remain private tools.

## Deployment

Build and run public mode with the versioned files described in [PUBLIC_SNAPSHOTS.md](PUBLIC_SNAPSHOTS.md). `createSupabaseServerClient` and its environment accessor reject public mode even if private credentials are accidentally present. Existing repositories use `createResearchDataClient`; public reads execute against the snapshot through a local query adapter. Configured remote snapshots are fetched only from their public object-storage location, without credentials. It preserves the existing query-builder interface for nested evidence, filters, pagination and counts. Unsupported operations fail closed.

Private settings remain server-only. No visitor authentication, queues, public database grants, or additional service is introduced.

The final [release security report](PUBLIC_RELEASE_SECURITY_REPORT.md) records endpoint/provider/write attempts, secret comparisons and ordinary hosting-cost limits. Public requests are now bounded and cached, image optimization is disabled, and insight transport uses bounded static chunks. No operational database fallback or public write grant exists.
