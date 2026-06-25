import type { SerpApiCityRanking } from "@/lib/serpapi/types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildRankingTooltipHtml(ranking: SerpApiCityRanking, businessName: string) {
  const topRows = ranking.topBusinesses
    .map((business) => {
      const label = business.isOurs ? `${escapeHtml(business.name)} (You)` : escapeHtml(business.name);
      return `<li><span class="font-medium">${business.rank}.</span> ${label}</li>`;
    })
    .join("");

  const ourRow =
    ranking.ourRank != null && ranking.ourRank > 3
      ? `<div class="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">#${ranking.ourRank}</span>
          ${escapeHtml(businessName)} (You)
        </div>`
      : "";

  return `
    <div class="gbp-ranking-tooltip">
      <p class="mb-2 text-sm font-semibold">${escapeHtml(ranking.cityName)}</p>
      <ol class="space-y-1 text-xs">${topRows}</ol>
      ${ourRow}
    </div>
  `;
}
