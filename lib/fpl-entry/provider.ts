import type { FplSquadFetchResult } from "./types";
export interface FplEntryProvider { fetchLatestPublicSquad(entryId: number): Promise<FplSquadFetchResult>; }
