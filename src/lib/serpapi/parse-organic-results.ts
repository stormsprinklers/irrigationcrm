export function normalizeWebsiteHost(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .toLowerCase();
  }
}

export function websiteHostsMatch(link: string, targetWebsite: string) {
  const targetHost = normalizeWebsiteHost(targetWebsite);
  if (!targetHost) return false;

  try {
    const linkHost = new URL(link).hostname.replace(/^www\./i, "").toLowerCase();
    return linkHost === targetHost || linkHost.endsWith(`.${targetHost}`);
  } catch {
    return link.toLowerCase().includes(targetHost);
  }
}

export type GoogleOrganicResult = {
  position?: number;
  title?: string;
  link?: string;
};

export function parseOrganicRankings(results: GoogleOrganicResult[], websiteUrl: string) {
  const sorted = [...results]
    .filter((result) => result.position != null && result.title && result.link)
    .sort((a, b) => Number(a.position) - Number(b.position));

  let ourRank: number | null = null;
  for (const result of sorted) {
    if (websiteHostsMatch(String(result.link), websiteUrl)) {
      ourRank = Number(result.position);
      break;
    }
  }

  const topBusinesses = sorted.slice(0, 3).map((result) => ({
    rank: Number(result.position),
    name: String(result.title),
    isOurs: websiteHostsMatch(String(result.link), websiteUrl),
  }));

  return { ourRank, topBusinesses };
}
