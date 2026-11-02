export const EXTRACTION_CITATION_REPAIR_PROMPT_VERSION = "extraction-citation-repair-v1";

export const EXTRACTION_CITATION_REPAIR_PROMPT = `You repair transcript evidence segment references for an already validated FPL insight extraction.

For every supplied insight, select one or more candidate segment IDs whose text directly supports the supplied evidence text and claim. The current invalid value may be a transcript timestamp in seconds rather than a segment ID. Return exactly one repair for every supplied insightIndex and no other insight indexes. Use only segmentId values present in that insight's candidates. Do not change, reinterpret, add, or remove insights. Do not invent evidence.`;
