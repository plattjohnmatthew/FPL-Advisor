import type { FplSnapshot } from "./types";

export interface FplDataProvider { fetchSnapshot(): Promise<FplSnapshot>; }
