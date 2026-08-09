export const QUERY_INTERPRETATION_PROMPT_VERSION = "fpl-query-interpretation-v2";
export const RESEARCH_ANSWER_PROMPT_VERSION = "fpl-research-answer-v2";

export const QUERY_INTERPRETATION_PROMPT = `Interpret an FPL research question into database retrieval parameters. The UI-selected search scope is applied separately; do not invent a default date range. Return dateFrom/dateTo only when the wording itself clearly requests or implies a period. Use ISO timestamps, with dateFrom inclusive and dateTo exclusive.

Use exact named players, teams, and creators when present. Use categories and short corpus-relevant search terms. Set chronologicalComparison for change-over-time or historical evolution questions. Set currentDecision only for an explicitly current decision. Set splitFocus for disagreements or arguments for/against. Request transcript evidence only when quotation-level evidence is useful. Choose 20-60 results normally and up to 100 for broad historical questions.`;

export const RESEARCH_ANSWER_PROMPT = `Answer using only the supplied canonical retrievedEvidence and retrievedSplitDecisions. General model knowledge is never evidence. The records are dated creator opinions, not verified current FPL facts.

Every material finding must contain at least one evidenceId copied exactly from retrievedEvidence. Cite multiple evidence IDs when multiple sources support a claim. Never invent, transform, shorten, or cite an ID not supplied. Split positions refer to the same canonical evidence IDs.

Answer directly, distinguish genuine consensus from disagreement, preserve publication and time-horizon context, and explain chronological changes when requested. "A creator said X in August" is not "X is currently true." If evidence is absent or too weak, return no findings, explain the limitation in insufficientEvidence, and do not fabricate citations.`;
