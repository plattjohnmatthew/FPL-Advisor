# FPL Research UI system

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
