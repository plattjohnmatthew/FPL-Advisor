# Public deployment

## URL and hosting audit

Use **https://fpl.john-platt.com** for the application and link to it from the personal website. The owner confirmed `john-platt.com` (the plural spelling in the request was a typo).

| Item | Evidence and result |
| --- | --- |
| Personal website | Live HTTPS responds with `Host-Header: WordPress.com`, nginx and WordPress assets, with no Next.js assets. The adjacent Personal Website checkout is a separate classic PHP WordPress theme, not a Next app. |
| FPL Research | Existing Vercel project: `team-john1/fpl-advisor`, identified by the owner. Supplied deployment hostname: `fpl-advisor-dcwxlra0f-team-john1.vercel.app`. Dashboard deployment: https://vercel.com/team-john1/fpl-advisor/C6AfsZtCn3imLbei4yoTfksrkq8H . The supplied hostname redirects to Vercel sign-in (deployment protection); app contents and account-side settings/Git linkage have not been verified through authenticated access. |
| Code repository | https://github.com/plattjohnmatthew/FPL-Advisor ; current local branch `main`. No `.vercel/project.json` link is present locally. The WordPress theme is not part of this repository. |
| Subpath | WordPress.com does not support hosting a separate app/site under a subdirectory. `/fpl-research` would need an additional reverse proxy/front door and Next base-path work. A subdomain is materially simpler and leaves the existing WordPress site untouched. No iframe. |

Sources: [live personal website](https://john-platt.com), [WordPress.com subdirectory limitation](https://wordpress.com/support/domains/connect-subdomain/#subdirectories), [Vercel Git deployments](https://vercel.com/docs/git). A WordPress `/fpl-research` page may describe/link to the app, or redirect to the subdomain; that is optional website administration, not a copied frontend.

## One-time manual setup

1. In the **existing** Vercel `team-john1/fpl-advisor` project, confirm Git is connected to the repository above, production branch is `main`, and the root directory is this Next.js app. Do not create a duplicate app/project.
2. Create/select a **public Vercel Blob store** for sanitized JSON. Keep its read/write token in the private local `.env.local` only. If connecting the store automatically injects `BLOB_READ_WRITE_TOKEN` into the app, remove it from Production/Preview/Development app environments before deploying. Runtime needs public GET access, not a storage token.
3. In local `.env.local`, configure `PUBLIC_SNAPSHOT_BASE_URL=https://<store-id>.public.blob.vercel-storage.com/fpl-research/` and the matching `BLOB_READ_WRITE_TOKEN`. Keep the existing private Supabase configuration locally. Run the publishing command below once to create the first remote snapshot.
4. Set Vercel app environments (Production and Preview): `APP_MODE=public_read_only`, `PUBLIC_SNAPSHOT_BASE_URL` as above. Optional: `NEXT_PUBLIC_GITHUB_REPO_URL`; `PUBLIC_SHOW_SQUAD=true` only after deliberate squad publication. Set the non-secret `FPL_SEASON_START_DATE` and `FPL_SEASON_END_DATE` to your chosen season boundaries if the This season filter is needed.
5. Remove any existing OpenAI/Supadata/provider credentials, Supabase keys/URL, FPL entry ID, `PUBLISH_PUBLIC_SQUAD` and **BLOB_READ_WRITE_TOKEN** from public app environments; do not add them again. Do not copy private `.env.local` to Vercel. `vercel.json` selects the guarded public build; cloud runtime also refuses private mode.
6. Review the preview deployment before promoting. Confirm the stable production domain and that its access protection permits anonymous visitors; the supplied preview hostname currently requires Vercel sign-in. Do not disable protection blindly on unrelated/private deployments. Add `fpl.john-platt.com` in this project's Domains settings, inspect any existing `fpl` DNS record and use the **exact current DNS instructions shown by Vercel**. Do not change apex A records or nameservers. Verify TLS and then add a link in WordPress. No DNS/domain/production setting was changed by this milestone.

## Publish new research data

After local processing finishes:

```powershell
$env:APP_MODE='private'
npm run publish:public-data
```

This generates/validates the complete sanitized snapshot, uploads immutable insight chunks of at most 100 rows, then a `<id>.json` manifest without insight rows, and finally replaces `current.json` with the manifest ID and SHA-256 digest. No code commit, Git push, application build or redeploy is required. Failed validation/upload leaves the old remote pointer active. Retained versions are never deleted. Do not run concurrent publishers; the last completed pointer update wins.

Public runtime only GETs the configured public Blob directory. It verifies schema, relationships and digest and caches each valid version in memory. CDN pointer propagation and the 60-second application cache can make a release/rollback take about five minutes to become visible. No fallback to the operational database or stale bundled data occurs when remote storage is configured. [Blob caching and overwrites](https://vercel.com/docs/vercel-blob) describe these cache limits. Storage/transfer usage is ordinary hosting usage; no AI/transcript generation is involved.

`npm run publish:public` remains the local-file-only export. Generated JSON is ignored by Git, so data releases cannot accidentally become code commits. Keep retained local snapshots for rollback.

## Deploy frontend/code changes

Run tests, lint/typecheck, `npm run build:public`, and `npm run check:public-http`; then commit the reviewed application changes and push to `main` through your normal Git workflow. Vercel Git integration builds the **same repository** using `npm run build:public`. It reads the existing published snapshot; it never regenerates research. Preview/branch deployments use the same public capabilities. No frontend files are copied into WordPress.

The build blanks private API/write credentials even when local dotenv files exist, validates the selected snapshot, runs Next's production build and scans browser artifacts for credentials. On Vercel it requires the public mode and remote snapshot URL to be configured. `npm run check:public-http` starts only a temporary loopback production server, exercises public reads and 403 denials, and blocks any non-snapshot external operation; it never probes an arbitrary live/private site.

## Test locally

```powershell
$env:APP_MODE='public_read_only'
$env:PUBLIC_SNAPSHOT_BASE_URL='https://<store-id>.public.blob.vercel-storage.com/fpl-research/'
npm run dev
```

Open http://localhost:3000 . To test bundled/local files instead, leave the remote URL unset in both the shell and local env file and first generate local JSON. No paid/write secrets are required by the public edition.

Production verification (isolated output avoids the existing Windows launcher log lock):

```powershell
$env:FPL_NEXT_DIST_DIR='.next-public-check'
npm run build:public
npm run check:public-http
```

Public navigation remains read-only. Previously requested showcase buttons stay visible, but only open the explanatory dialog; they are not executable mutations. Server checks reject direct processing, AI, synthesis, refresh, creator and settings mutations before services run. `docs/public-deployment-checks.json` records the latest actual HTTP verification.

## Chunked transport migration

The final security milestone replaces monolithic public JSON with `insight-chunks-v1`. Before first promotion, publish this format to a fresh Blob prefix and test the preview against that prefix. Do not point new code at an old monolithic object. If legacy bulk snapshot objects were previously published, retain their full local archives and have the owner retire those public copies after the migration is approved; no cloud objects were inspected or deleted by this milestone. Roll back only to versions/code supporting this transport. Code/data updates remain independent after this one-time migration.

## Roll back data

Choose an earlier retained snapshot ID and run locally with the matching store configuration:

```powershell
$env:APP_MODE='private'
npm run rollback:public-data -- <retained-snapshot-id>
```

The command validates the retained local file, verifies the immutable remote file/digest still exists, then changes only the remote pointer. It does not regenerate research or roll back application code. Do not edit immutable snapshot files. Old opted-in squad versions remain public if previously uploaded; omitting a squad from a new version does not erase old files.

## Roll back code

In Vercel → existing FPL project → Deployments, select the previous verified public deployment and use **Instant Rollback** where your plan permits, or promote a known-good deployment. Data remains on its current snapshot; choose a compatible data version separately if rolling across a future schema change. Revert/fix the Git change before restoring normal production deployment. After Instant Rollback, Vercel pauses automatic production-domain assignment; explicitly undo the rollback/promote the corrected deployment to resume it. See [Vercel rollback instructions](https://vercel.com/docs/instant-rollback).
