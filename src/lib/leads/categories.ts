export const GIVING_LEAD_SOURCES = [
  "share-the-cheer-nomination",
  "share-the-cheer-partner",
] as const;

export function isGivingLeadSource(source: string | null | undefined) {
  const normalized = source?.trim().toLowerCase();
  return GIVING_LEAD_SOURCES.some((value) => value === normalized);
}

