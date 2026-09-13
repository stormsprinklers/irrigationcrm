import type { GscSite } from "./types";

export function accessibleSites(sites: GscSite[]) {
  return sites.filter((s) => ["siteOwner", "siteFullUser", "siteRestrictedUser"].includes(s.permissionLevel));
}

export function pickDefaultSite(sites: GscSite[], websiteUrl?: string | null) {
  const allowed = accessibleSites(sites);
  if (!allowed.length) return null;
  if (websiteUrl) {
    try {
      const url = new URL(websiteUrl.includes("://") ? websiteUrl : `https://${websiteUrl}`);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      const domain = allowed.find((s) => s.siteUrl.toLowerCase() === `sc-domain:${host}`);
      if (domain) return domain.siteUrl;
      const exact = allowed.find((s) => s.siteUrl === `${url.origin}/`);
      if (exact) return exact.siteUrl;
      const sameHost = allowed.find((s) => {
        try { const candidate = new URL(s.siteUrl); return candidate.hostname.replace(/^www\./, "").toLowerCase() === host && candidate.pathname === "/"; }
        catch { return false; }
      });
      return sameHost?.siteUrl ?? null;
    } catch { return null; }
  }
  return allowed.find((s) => s.permissionLevel === "siteOwner")?.siteUrl ?? allowed[0].siteUrl;
}
