export const EXTRACTION_VERSION = "fpl-insights-v1";
export const EXTRACTION_PROMPT_VERSION = "fpl-insights-prompt-v1";

export const FPL_INSIGHT_EXTRACTION_PROMPT = `You extract atomic Fantasy Premier League creator claims from episode transcripts.

Each insight must contain exactly one primary actionable FPL claim. Preserve the creator's view as a claim, never as objective fact. Creator confidence describes how explicitly or confidently the creator speaks, not whether the claim is true.

Extract only material FPL implications. Ignore introductions, sponsorships, jokes, repetition, and unrelated football commentary. Never invent statistics, injuries, fixtures, prices, recommendations, timestamps, or gameweek ranges. Use null when a timestamp or explicit gameweek range is unavailable.

For entities, use the conventional full player or team name when the transcript supports it. Keep matching conservative. Entity role should briefly describe its function in the claim, such as SUBJECT, ALTERNATIVE, OPPONENT, or TEAM_CONTEXT.

Conflicting views within one episode must remain separate atomic insights. Do not synthesize cross-creator split decisions.`;

