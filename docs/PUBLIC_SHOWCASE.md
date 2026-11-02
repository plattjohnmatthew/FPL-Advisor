# Public showcase

Public mode demonstrates the full product using the real published snapshot. Read-only means no backend generation or mutation, rather than hiding all product affordances.

## Shared action gate

`ShowcaseProvider` owns one dialog for the whole application. `ShowcaseActionGate` wraps controls; `useShowcaseAction` guards form/async handlers before loading state or network calls. Both use the same decision helper and contextual copy. Private handlers execute normally. Public handlers return immediately and open “Read-only showcase”, explaining the feature and linking to GitHub/local setup. No fake answers, runs, loading or completion are shown.

The shared native Dialog provides labelled semantics, focus trapping, Escape/backdrop/close handling and focus return to the triggering control. Dialog actions wrap and stack on narrow screens. There is no hover-only requirement or error styling.

## Public routes and controls

Overview retains briefing findings, evidence, creator episodes and AI question shortcuts. Ask AI exposes the real composer, scopes and suggested prompts; valid submission opens the showcase dialog and never submits to the research endpoint. Nothing is persisted. No saved personal answers are published.

Intelligence retains all browsing/filter/history functions, with Generate/Regenerate visible and gated before even opening the generation workspace. Player/team research retains metadata and evidence with an Ask link into the public composer.

Sources shows published creators and completed episodes. Add creator, creator selection, Process creators, Process URLs, Retry, Resume, Pause and Cancel are showcase-gated. Recovery controls describe capabilities, not fake historical jobs. No raw errors, retry records, usage or operational poller is used.

Public `/settings` renders How it works, describing models, transcript providers, research instructions and FPL integration without reading settings or showing actual values. Configure AI and Refresh FPL data are gated. Private `/settings` remains the existing working settings interface.

The API request allowlist remains GET/HEAD entity search and stored synthesis reads only. Every mutation handler retains its pre-body 403 guard. Public runtime cannot construct an operational database client. The browser gate is presentation, never authorization.

## Optional squad

No squad is published or displayed by default. To intentionally publish your selected saved squad, set `PUBLISH_PUBLIC_SQUAD=true` in the private publishing environment and run `npm run publish:public`. This explicitly publishes the public entry ID, team name, saved picks/captain/vice/bench, points and saved observation time, but excludes manager name and refresh errors. The publisher performs only saved-data reads and does not reconcile, refresh or change the selected entry. A saved selection and complete squad must already exist.

Set `PUBLIC_SHOW_SQUAD=true` in the public build/runtime to expose `/squad` and its navigation. It reads only the optional snapshot payload, validates all player relationships, and derives intelligence/fixtures from the same published corpus. Both opt-ins are necessary. Refresh, Change FPL entry and squad AI submission are gated. Visitors cannot submit/store team IDs. Missing published squad data remains an honest empty state. Re-publish with the publishing flag unset to omit a squad in the next version; earlier exported files still contain the previously opted-in data, so review which immutable versions you deploy.

## Source and setup

`NEXT_PUBLIC_GITHUB_REPO_URL` is validated through `getShowcaseLinks` and used by the sidebar, shared dialog and How it works. It defaults to the verified git origin, `https://github.com/plattjohnmatthew/FPL-Advisor`. Forks can override it. The setup link targets README's Local setup anchor. The app never needs the owner's keys. The sidebar/footer makes source code discoverable without clicking a restricted action.

Public metadata describes real research pages and contains no visible database identifiers. No analytics product has been added. Publish snapshots locally and deploy separately; UI implementation does not publish a website.

Independent code/data deployment and rollback commands are documented in [PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md). Public runtime reads a published snapshot from files or the configured public object store, never operational Supabase.
