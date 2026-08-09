# AGENTS.md

## Project purpose

This repository contains a personal Fantasy Premier League research application. It monitors a predefined set of FPL YouTube and podcast sources.

When manually triggered, the application must:

1. Find episodes published since previous runs.
2. Obtain their transcripts.
3. Extract structured FPL insights.
4. Identify important split decisions and disagreements across sources.
5. Store the full historical corpus permanently.
6. Generate a summary of the latest processing run.
7. Answer natural-language questions against the full historical knowledge base.

## Fixed architecture decisions

Use:

- Next.js.
- TypeScript.
- Supabase Postgres as the persistent database.
- The OpenAI API for structured extraction, synthesis, and query interpretation.
- Vercel for eventual hosting.

Do not use unless this file is explicitly revised:

- SQLite.
- A vector database initially.
- Embeddings initially.
- Autonomous agents.
- Queues unless they become demonstrably necessary.
- Authentication initially.
- Multiple services where the Next.js application can handle the job.

## Data principles

- Retain the complete history permanently.
- Append new processing runs to the corpus. Never replace historical episodes or insights.
- Preserve provenance for every insight back to its source, episode, publication date, and transcript evidence where available.
- Treat creator opinions as claims, not objective facts.
- Model split decisions as first-class derived records.
- Every split-decision record must capture:
  - The decision or question.
  - The competing positions.
  - The creators and insights supporting each position.
  - The reasoning for each position.
  - The unresolved question or implication.

## Processing principles

- Processing must be incremental and idempotent.
- Use source checkpoints, external episode IDs, processing runs, and per-episode processing state.
- Do not roll back completed episodes when another episode fails.
- Later runs must retry incomplete episodes without duplicating completed data.

## Product interface

The MVP should ultimately provide one simple main screen containing:

- A **Process new episodes** button.
- Current or latest processing status.
- The latest run summary and insights.
- Split decisions.
- A chat interface that queries all historical knowledge.

## Engineering workflow

- Prefer the simplest implementation that meets the current milestone.
- Do not implement future milestones unless explicitly requested.
- Avoid placeholder architecture that adds complexity without current value.
- Before making changes:
  1. Inspect the relevant existing files.
  2. State a short implementation plan.
  3. Implement only the requested milestone.
  4. Run the appropriate lint, typecheck, and tests.
  5. Fix failures caused by the changes.
  6. Summarize exactly what changed.
- Update `docs/BUILD_STATUS.md` at the end of every milestone.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
