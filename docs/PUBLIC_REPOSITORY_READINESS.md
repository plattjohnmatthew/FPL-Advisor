# Public source release readiness

## Local review — 3 November 2026

The same FPL-Advisor repository can support the local full application, the hosted read-only edition and public source distribution. No separate frontend copy is needed. Repository visibility has not been changed, and no commit or push was performed during this review.

- Fetched `origin` branches/tags before auditing. The fetched refs contain two commits and 294 historical file blobs. Known-value/pattern checks also inspect commit/tag messages and all tracked/non-ignored candidate files. No detected credentials in history; no historical private env files, private-key files, transcript text exports or database dumps were identified by the path checks.
- Compared four current local credential values without printing them. No matches in publishable source/history. Independent **Gitleaks 8.30.1** scans of both all-ref Git history and a copy containing only candidate Git files found no leaks. The portable scanner came from its [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), verified against that release's SHA-256 checksums. It is an ignored local audit tool, not an application dependency.
- Two scanner findings were fake Blob tokens in regression fixtures. Their strings are now assembled from readable fixture components, preserving runtime behavior without broad detector exemptions. No actual exposed credential was identified, so this review provides no evidence requiring a key rotation.
- Forty local QA image captures are now ignored rather than included in the source release. They remain on the owner's computer. `.env.*`, local Vercel links and common private-key files are excluded; `.env.example` remains publishable. Supabase `.temp` files, local real transcript files, generated snapshots and temporary audit reports/tools are ignored. A tracked file would still be audited even if an ignore rule matched it.
- The owner's personal domain/project identifiers and public creator/source links remain in deployment history/docs; these identify the project and are not credentials. Existing Git commit author metadata includes the author's personal email address. **Making this history public exposes that address.** No history rewrite or author setting was performed. Decide whether that is acceptable before changing visibility; a future Git no-reply address does not change old commits.

  Follow-up: at the owner's explicit request, both local `main` commits now use `john@john-platt.com` for author and committer email, and repository-local `user.email` uses that address for future commits. Original trees, messages and dates were preserved; the index and all uncommitted work are unchanged. An ignored local recovery bundle retains the original history. **GitHub still has the old commits/email** until a coordinated history replacement; do not make it public yet. Updating `main` also triggers Vercel, so coordinate the remote replacement with the reviewed public application release, using a lease against the expected old remote tip. GitHub cached/hidden references can retain old metadata even after a branch rewrite; this is an author-attribution correction, not a guarantee of erasing an email from every server-side copy.
- MIT license added at the owner's explicit choice. Geist retains its bundled SIL Open Font License. Dependencies retain their own licenses; creator transcripts, FPL data and third-party branding are not relicensed as project-authored code.
- README now covers own-key setup, dedicated hosted Supabase linking/migrations, empty initial corpus, optional Python/Supadata, localhost binding, account-supported model settings and the distinct public/private modes. `SECURITY.md` states the unauthenticated private-mode boundary and reporting guidance.
- All database migrations and synthetic tests are present in the candidate source. Historical guarded demo/source repairs remain intact for compatibility with existing installations. They do not bundle the owner's research corpus. No migration was applied to an operational database. A fresh database bootstrap/SQL test was not executed in this review because no local Supabase/Docker stack was available; do not equate source inspection with a fresh-install database certification.
- Application prompt templates become public source intentionally. The website's prompt-exclusion rule concerns browser responses/snapshots. Secrets and database-stored personal custom instructions remain excluded; source distribution is not an attempt to keep built-in prompt code confidential.

Machine-readable local results: [repository-audit.json](repository-audit.json). `npm run audit:repository` repeats the built-in scan and fails on findings, suspicious private paths or unreviewed binary files. It reports categories/paths only, never matched values. Run it again after further edits and immediately before sharing source.

Validation: **284/284 tests pass**, including encoded-credential detection and binary Git-object parser checks. Lint and typecheck pass. The public production build validates the live published Blob snapshot successfully without paid/write credentials and passes the browser scan of 21 artifacts. Independent scanner evidence is summarized in [repository-independent-audit.json](repository-independent-audit.json).

## Owner checks before changing visibility

The local audit does **not** inspect GitHub-hosted Actions logs/artifacts, issues/discussions, releases/attachments, wikis, hidden pull-request refs or unreachable server-side objects. Review those in the existing GitHub repository, including any past uploaded screenshots. If sensitive material exists, remove it and rotate affected keys as appropriate before changing visibility. This review does not silently delete or rewrite remote history.

GitHub makes Actions history/logs public when visibility changes. Copies/forks may survive changing it back. See [GitHub's visibility guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

Before pushing, review the complete staged diff: there are many previously uncommitted milestones, not only this source-readiness change. Confirm ignored private files/captures are absent and the MIT license and migrations are included. A push to `main` triggers the connected Vercel production pipeline; use a reviewed branch/Preview first while checking the deployed app. This review has not authorized or performed an automatic production push.

Once the account checks, author-email decision and reviewed source commit are complete, visibility can be changed in GitHub **Settings → General → Danger Zone → Change repository visibility**. Keep Vercel public mode and its credential-free data settings unchanged. Public GitHub code does not itself publish the private database or change the site's server capabilities.

## Repeatable checks

```powershell
npm run audit:repository
npm test
npm run lint
npm run typecheck
```

Optional independent scanner, when installed: `gitleaks git . --log-opts=--all --redact=100`. For the working tree, scan only the candidate source files from `git ls-files --cached --others --exclude-standard`; do not copy ignored credentials into a public report. Default scan patterns cannot prove every possible secret absent.

Build the public edition with the existing guarded `npm run build:public`; private local users run `npm run dev -- --hostname 127.0.0.1`. No fresh public data generation is needed for a code-only release.
