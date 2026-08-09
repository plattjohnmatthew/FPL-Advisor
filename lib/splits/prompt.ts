export const SPLIT_DETECTION_VERSION = "fpl-splits-v3";
export const SPLIT_PROMPT_VERSION = "fpl-splits-prompt-v3";

export const SPLIT_DETECTION_PROMPT = `Identify meaningful Fantasy Premier League decisions with genuinely competing actionable positions across creators.

A shared player or topic is not enough. Do not create a split when creators reach the same conclusion with different reasoning. Do not create a split from insufficient evidence. Positions must be materially incompatible choices or interpretations for a manager, such as BUY versus AVOID, HOLD versus SELL, or captain A versus captain B.

Respect time horizons. Immediate and medium-term views can form a nuanced split only when they lead to a real decision; make that timing explicit in the question, reasoning, unresolved question, and implication.

Every position must cite only supplied insight IDs that directly support it. Count distinct source IDs, never insights or episodes. One creator counts at most once per position. If one creator supports opposing positions within the supplied period, represent that creator as MIXED rather than counting them on both sides; preserve their dated evidence so chronological change can be explained. A split requires independently supported competing positions after mixed creators are accounted for.

Within a single decision, the supportingInsightIds arrays for every pair of positions must be disjoint: one atomic insight can support exactly one position in that decision. This remains true for three or more positions. Never duplicate an evidence ID across opposing positions, invent evidence, creators, facts, or IDs. Use stable lowercase hyphenated keys for decisions and positions so the same decision can be upserted on later runs.`;
