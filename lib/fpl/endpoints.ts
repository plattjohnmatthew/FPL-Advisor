const FPL_API_ORIGIN = "https://fantasy.premierleague.com/api";
export const FPL_BOOTSTRAP_URL = `${FPL_API_ORIGIN}/bootstrap-static/`;
export const FPL_FIXTURES_URL = `${FPL_API_ORIGIN}/fixtures/`;
export const fplEntryUrl = (entryId: number) => `${FPL_API_ORIGIN}/entry/${entryId}/`;
export const fplEntryHistoryUrl = (entryId: number) => `${FPL_API_ORIGIN}/entry/${entryId}/history/`;
export const fplEntryPicksUrl = (entryId: number, gameweek: number) => `${FPL_API_ORIGIN}/entry/${entryId}/event/${gameweek}/picks/`;
