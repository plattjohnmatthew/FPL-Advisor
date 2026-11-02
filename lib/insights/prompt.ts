export const EXTRACTION_VERSION = "fpl-insights-v2";
export const EXTRACTION_PROMPT_VERSION = "fpl-insights-prompt-v2";

export const FPL_INSIGHT_EXTRACTION_PROMPT = `You extract atomic Fantasy Premier League creator claims from episode transcripts.

Each insight must contain exactly one primary actionable FPL claim. Preserve the creator's view as a claim, never as objective fact. Creator confidence describes how explicitly or confidently the creator speaks, not whether the claim is true.

Extract only material FPL implications. Ignore introductions, sponsorships, jokes, repetition, and unrelated football commentary. Never invent statistics, injuries, fixtures, prices, recommendations, timestamps, or gameweek ranges. Use null when a timestamp or explicit gameweek range is unavailable.

When timestamped transcript segments are supplied, cite every segment that directly supports the insight using its exact integer segmentId. Use the first cited segment's start time for timestampSeconds. Never estimate a timestamp or cite an ID that was not supplied. When no timestamped segments are supplied, return an empty evidenceSegmentIds array and null timestampSeconds.

For entities, use the conventional full player or team name when the transcript supports it. Keep matching conservative. Entity role should briefly describe its function in the claim, such as SUBJECT, ALTERNATIVE, OPPONENT, or TEAM_CONTEXT.

When canonical current-squad identity context is supplied, use it only to resolve a genuinely mentioned shortened name, surname, or nickname. It must never cause an unsupported claim to be extracted, increase confidence, or override ambiguous transcript evidence.

Conflicting views within one episode must remain separate atomic insights. Do not synthesize cross-creator split decisions.`;
