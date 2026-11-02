# FPL Research UI system

## Milestone 6 — Players, teams and squad

`/players` and compatible `/entities` search share `EntitySearch`. Its read-only endpoint debounces at 250ms, aborts superseded requests and returns at most ten players plus ten teams. Registry reads page on the server. Canonical names, aliases, saved full/display names, clubs/short names and exact FPL IDs match without changing mappings. Grouped suggestions support arrows, Enter and Escape; a normal GET form preserves bookmarkable search results.

`/entities/[entityId]` is the shared player/team research surface. `EntityMetadata`, `EntityArguments` and `EntityChronology` reuse saved official observations and existing recommendation stance rules. Missing fields are omitted and observation times expose freshness. Argument/chronology links reference provenance-rich claim cards; split citations open canonical episode insights. Creator counts/sentiment retain the existing aggregation. No new statistics or analytics pipeline is introduced.

Period, creator, category, recommendation and sort controls retain native GET/URL state with explicit accessible names and shared controls. Ask links carry the selected period, including custom bounds. Route-specific skeletons and a recoverable detail error supplement empty-state guidance. The existing full research route makes a second player drawer unnecessary.

My Squad retains official fixture selection, formation, all fifteen picks, ordered bench, club shirts, prices and captain/vice markers. Mapped tiles open 14-day entity research; unmapped tiles open a 14-day FPL-ID search without inventing mappings. Four compact actions prefill `/ask` with My Team context and Last 14 days. Ask resolves the database-selected squad only on explicit submission. Inline squad chat reuses the shared grounded-answer renderer. Refresh retains its backend and refreshes the server research view afterward.

Narrow pitch tiles retain readable metadata and the bench uses two mobile columns. Filters stack as needed. Mobile form controls use 16px text to reduce browser focus zoom. Primary link buttons explicitly retain a contrasting foreground despite legacy link styling. The skip link stays off-canvas until focused; reduced-motion rules override the subtle 160ms pitch hover.

The selected entry remains database-first in `fpl_selected_entry`; localStorage stores only sidebar presentation. Historical transcripts, insights, canonical mappings and squad snapshots are not rewritten for this milestone. Earlier sections describe their milestone-era composition; `/ask`, `/intelligence` and `/` now use dedicated research surfaces, while `/sources` retains the operational dashboard.

## Milestone 4 — Overview (2 November 2026)

`/` is a server-rendered research surface headed “Your FPL briefing”. It reads a current seven-calendar-day publication period and shows “What you need to know” immediately below the header. It no longer mounts the legacy combined Dashboard or its processing polling and chat handlers. Sources remains the operational workspace; Intelligence remains the feed and the only manual briefing-generation entry point.

The strongest available persisted briefing themes supply up to five citable findings. Selection ranks distinct creator breadth, decision-category priority and latest evidence date, with repeated headline/explanation text suppressed. A theme must retain actual cited insights and at least one included-period episode. Stored counts are never accepted as a substitute for creator-ID aggregation. A single creator remains one creator regardless of episode volume, mixed stances cannot become consensus, and ownership never affects ranking or breadth.

When the exact current-period briefing does not exist, a prominent honest notice remains visible. Available current-period structured claims can still supply clearly labelled topic findings: the displayed text is a short verbatim excerpt of the latest claim, with its author identified. Breadth means creators discussing that topic, not creators agreeing with that claim. If no saved research is available, the section shows an empty state linking to Intelligence. Fewer supported findings are shown rather than inventing enough to reach a count.

Each finding has an explanation limited to two sentences, its creator breadth, relevant canonical player/team links, latest publication evidence date, an internal inspect link and expandable original-source citations. Related entities are kept focused on the headline subject rather than listing every co-mention. Current saved squad picks and existing canonical mappings add a subtle “In your team” marker without writes or identity reconciliation.

Latest creator intelligence uses a separate newest-first query for five successfully processed episodes across history. It requires saved transcripts and insights and excludes episodes with an incomplete/failed latest attempt. Legacy manual imports without an attempt remain eligible when their saved content exists. The query pages past unsuccessful candidates; publication dates are not replaced by processing timestamps. No standalone episode summaries exist, so available text is labelled as an extracted claim.

Captaincy, Transfers and Players to Watch open `/ask?q=…`; My Squad opens `/squad`. The question form and three suggested prompts also navigate to Ask with a prefilled question. Prefill never auto-submits; the existing Ask engine runs only after its own explicit submission. Overview contains no duplicate chat implementation. New research links and sidebar navigation disable eager route prefetch so reading Overview does not initialize other workspaces.

The header's intelligence update time is the latest persisted insight/report creation time. Current/next event flags and deadlines are not stored reliably enough to reconstruct current calendar context: a saved squad gameweek or observed registry event ID is not treated as a live calendar. Gameweek/deadline fields are therefore omitted, and the subtitle uses “The opinions, updates and decisions that matter right now.” No live FPL or OpenAI request is introduced on Overview load.

## Milestone 3 — Intelligence (2 November 2026)

`/intelligence` is a dedicated research feed with server-side pages of 20 episodes ordered by `published_at DESC, id DESC`. The browser receives only the current page's title/source/date/status, topic labels and a short verbatim extracted-claim excerpt. There is no standalone stored episode-summary field, so no summary is invented. Completed status is omitted; incomplete states use the existing compact StatusBadge and expose no retry or ingestion control.

Filters persist as `q`, `from`, `to`, `creator`, `category`, `type`, `page` and optional `tz` query parameters. Search is a 250ms debounced case-insensitive literal title search. Date bounds are inclusive calendar days through the existing UTC-boundary helper; selecting dates records the browser's offset. Creator, extraction-category and configured source-type filters operate on stored metadata in Postgres. Active chips can be removed individually or cleared together. Filters reset pagination, operate independently of synthesis, and never invoke OpenAI. The shared Pagination drives server requests rather than downloading the full historical corpus.

Inspect links open `/episodes/[episodeId]` with a validated internal `returnTo` containing the feed filters/page. Episode detail retains its existing claims, reasoning, evidence and player/team links, and adds ingestion date, original URL, grouped mentions/topics and collapsed technical metadata. The return context survives detail filtering and clearing. Timestamp links reuse the central five-second evidence lead-in with zero clamping. Historical missing timestamps and unsupported deep-link platforms retain the original source URL without claiming timed playback.

One `Generate briefing` entry opens a date dialog, defaulting to the last seven local publication days because no reliable current-gameweek period is persisted. Its period covers all creators independently of feed filters. Opening/changing the dialog only reads stored reports; its explicit Generate submit calls the existing synthesis service. Idle, generating, completed, failed and no-eligible-content states are supported without invented percentages. The old dashboard generation control has become a link to Intelligence; Sources retains all Milestone 2 operations.

Briefing rendering preserves stored claims, creator-level supporting breadth, reasoning, caveats, split positions and source provenance. Technical metadata exposes period, original generation time, included episode/source IDs, model, prompt version, pipeline version and mode. Old briefings retain their historical date/model metadata and explicitly show when pipeline version was not recorded.

Reuse fingerprints cover exact UTC bounds, included/excluded episodes, all structured insight content and entity/source provenance, split decisions, prompt/custom-instruction version, final and reduction models/prompts, pipeline version and token-budget configuration. Only validated reports linked to completed attempts with the same included episode set can be reused. Reuse records another completed attempt without invoking generation; changed input appends a new derived report. Older reports without fingerprints remain readable but are not assumed reusable. Cache audit metadata is stored additively in existing `summary_data._synthesis`; no migration or overwrite/backfill is performed.

The existing token-aware DIRECT/HIERARCHICAL strategy and creator-brief cache remain intact. Server-side synthesis input reads now page past the hosted row limit so a large selected period is not silently truncated. No raw transcript is passed into synthesis, and no transcript, extraction, ingestion, queue or Sources state model was added or changed.

## Milestone 2 — Sources & processing (2 November 2026)

`/sources` owns source selection/addition, creator runs, URL batches, current/latest run state and episode retry/pause/resume/cancellation/dismissal. Overview no longer renders the processing panel or its operational actions; its existing research content remains unchanged pending the Overview brief.

`components/processing-workspace.tsx` provides scoped metrics, a compact five-column processing list, client pagination, refresh and an accessible side drawer using the shared Dialog. Desktop rows become stacked items on mobile. The list combines latest-run rows, outstanding latest attempts across runs (including paused/pending work), URL validation outcomes and run-level issues. Full diagnostic errors are confined to collapsed drawer details. Dismissed latest-run rows may remain visible as history with their actual status and a dismissal label.

Metric definitions: Sources = all configured sources, including disabled ones; Processed = completed episodes in the latest run; Failed = unresolved latest failed episode attempts across all runs, with cancelled attention items separately noted; Last sync = completion time of the most recent fully completed ingestion run. Publication dates never stand in for processing-update timestamps. Missing attempt times display “Not recorded”.

Retry starts show an immediate busy state, prevent duplicate start requests and keep polling while either a local request or persisted run is active. They display completion only after persisted status reports it. Cancellation remains available during a long retry request and uses existing cooperative backend semantics. The current safe operation may complete; saved work is retained. No queue, new processing state, worker or ingestion service was added.

The sidebar health link now reads `/api/research-health`: unresolved, non-dismissed failed/cancelled latest episode attempts determine attention count; otherwise the latest persisted insight creation time supplies “Research updated”. It refreshes every 30 seconds and after operations. This reports research attention rather than treating a handful of failures as a broken application.

Milestone 2 preserved the interrupted Milestone 3 work without wiring it into Intelligence. Milestone 3 and the Overview redesign were subsequently completed as documented above.

## Milestone 1 foundation (2 November 2026)

This section supersedes the earlier layout and visual specifications below. Individual product pages retain their existing feature composition until separately briefed.

- `app/foundation.css` owns the semantic palette, spacing, radii, typography and shared control styles. Existing CSS names (`--ink`, `--paper`, `--green`, etc.) are aliases to these tokens. Add semantic tokens here rather than new component colors. Official fixture difficulty colors and club kits remain page-specific domain styling.
- Canvas `#F8F9F7`, surface `#FFFFFF`, subtle surface `#F1F4F1`, primary text `#17251E`, secondary text `#64736A`, brand `#117848`, hover `#0D6039`, brand subtle `#E6F3EB`, border `#E3E9E4`, success `#168254`, warning `#B7791F`, danger `#C74742`. Warning and danger use darker foreground tokens for small text contrast.
- Radii: 6 / 10 / 14px. Spacing: 4 / 8 / 12 / 16 / 24 / 32px.
- Self-hosted Geist Latin is loaded through `next/font/local`; its SIL Open Font License is included under `public/fonts/`. Page / section / card headings use 28px at 650, 19px at 600, and 15px at 600. Body is 14px with 1.5 line height; secondary / metadata / labels are 13 / 12 / 11px. Numeric metrics, dates, fixtures and prices use tabular numerals.

## Shared React components

`components/ui/primitives.tsx` exports Button, IconButton, Input, SearchInput, Select, PageHeader, Card, StatusBadge, EmptyState and Skeleton. Native props pass through; supply a visible label or accessible name for inputs/selects and a required `label` for icon/search controls. Button defaults to `type="button"`; use `type="submit"` explicitly in forms. Button variants are primary, secondary and danger. Button, Input and Select accept `loading` and `disabled`; loading exposes `aria-busy` and disables interaction.

`components/ui/interactive.tsx` exports Tabs, Dialog, Toast and Pagination. Tabs support arrows/Home/End, disabled/loading states, roving focus and a linked panel. Dialog uses the browser's modal dialog behavior for focus containment, Escape and focus restoration, and has a named close button. Toast exposes status/alert text and explicit dismissal. Pagination uses named previous/next buttons with disabled boundary/loading states. These requested primitives are available for later milestones; no demonstration gallery or extra product functionality was added.

The dashboard and entity search reuse the shared controls and PageHeader; the shell reuses IconButton, StatusBadge and Dialog; squad loading reuses Card and Skeleton. Existing page panels and empty-state classes remain compatible with the shared tokens.

## Persistent shell and navigation

`components/app-shell.tsx` exports AppShell, Sidebar and TopBar. The root layout preserves server-rendered page children inside the client shell. A fixed desktop sidebar provides Overview `/`, Intelligence `/intelligence`, Ask AI `/ask`, Players & Teams `/players`, My Squad `/squad`, Sources `/sources`, and footer Settings `/settings`. It replaces the old global top navigation.

- At 1280px and above, the default sidebar is 240px. At 768–1279px, the default is the 64px rail. A user may toggle either size; `fpl-sidebar-collapsed` stores only this UI preference in localStorage. Blocked storage leaves responsive navigation usable.
- Below 768px, navigation is a modal drawer. It traps focus, closes with Escape or a navigation selection, restores trigger focus, locks background scrolling, and closes when resized to desktop.
- Content padding is 32px desktop, 24px tablet, 16px mobile. Dashboard/squad/fixtures content is bounded to 1200px; long-form detail pages to 880px. Narrow layouts wrap controls and use a single column. Fixture tables retain contained horizontal scrolling.
- Active destinations use `aria-current="page"`, a subtle brand fill and stronger type. Existing episode/entity, fixture and analysis routes map to their parent navigation area.
- The top bar supplies the current area and navigation controls. No unverified gameweek, deadline, profile or unimplemented search affordance is shown. Footer research connection status comes from the existing read-only `/api/health` endpoint and does not imply that all episodes or providers are healthy.
- `/intelligence`, `/ask`, and `/sources` reuse the existing dashboard sections and handlers through `components/research-page.tsx`. `/players` reuses entity search. Existing `/entities`, `/fixtures`, `/analyses`, episode details and squad routes continue to work. Fixtures is linked from Players & Teams; My Analyses is linked from Ask AI.

All shared controls have visible focus, practical 44px targets, named actions, and disabled treatments. The skip link targets the focusable content wrapper on every route. Reduced-motion preference disables animations, transitions and smooth scrolling.

## Earlier page composition notes

## Product structure

The interface is organized around **Intelligence**, **Ask**, **Content**, **Explore**, and **Settings**. Home prioritizes current intelligence and research. Operational controls are progressively disclosed; prompt preferences live on Settings.

## Visual language

- Pale neutral canvas and white primary reading surfaces.
- Deep green for primary actions and trusted links, lime only for the brand accent, amber for unresolved splits, and red for actionable failures.
- Prefer typographic hierarchy and dividers over nesting every item in another card.
- Use readable measures and generous line height for reports.

## Layout

- Dashboard maximum width: 1180px; detail maximum width: 1040px.
- Spacing increments: 4, 8, 12, 18, 24, 30, and 48px.
- Panels use 16px radii; controls use 7–10px radii.
- Desktop groupings reduce at 900px. Below 560px controls stack and navigation can scroll horizontally.

## Components

- **Site header:** persistent access to the five product areas.
- **Hero:** purpose, freshness, and primary processing entry.
- **Processing workspace:** compact when idle; creator and URL modes are mutually exclusive.
- **Status chips:** always pair color with status text.
- **Intelligence report:** editorial overview, themes, evidence, and distinctive split callouts.
- **Research composer:** scope, question, loading state, grounded answer, limitations, and sources.
- **Detail cards:** taxonomy, reasoning, evidence, and provenance.
- **Technical details:** provider/database messages are collapsed beneath human-readable summaries.

## Content and accessibility

- Never present creator opinions as verified facts; keep evidence adjacent to claims.
- Explain empty states and the next useful action. Label paid AI actions.
- Preserve semantic headings and labels, live status regions, visible keyboard focus, 44px primary controls, text alongside status colors, and the skip link.
