export function isSerpApiConfigured() {
  return Boolean(process.env.SERPAPI_API_KEY?.trim());
}

/** Placeholder for SerpAPI local pack fetch — wired in a follow-up step. */
export async function fetchLocalPackRankings(_params: {
  keyword: string;
  location: string;
  businessName: string;
}): Promise<never> {
  throw new Error("SerpAPI integration not configured yet");
}
