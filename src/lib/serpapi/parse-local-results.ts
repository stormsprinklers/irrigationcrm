export function canonicalNameToSerpLocation(canonicalName: string) {
  return canonicalName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function normalizeBusinessName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(llc|inc|co|corp|company|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function businessNamesMatch(a: string, b: string) {
  const left = normalizeBusinessName(a);
  const right = normalizeBusinessName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export type GoogleLocalResult = {
  position?: number;
  title?: string;
};

export function parseGoogleLocalRankings(
  localResults: GoogleLocalResult[],
  businessName: string
) {
  const sorted = [...localResults]
    .filter((result) => result.position != null && result.title)
    .sort((a, b) => Number(a.position) - Number(b.position));

  let ourRank: number | null = null;
  for (const result of sorted) {
    if (businessNamesMatch(result.title ?? "", businessName)) {
      ourRank = Number(result.position);
      break;
    }
  }

  const topBusinesses = sorted.slice(0, 3).map((result) => ({
    rank: Number(result.position),
    name: String(result.title),
    isOurs: businessNamesMatch(result.title ?? "", businessName),
  }));

  return { ourRank, topBusinesses };
}
