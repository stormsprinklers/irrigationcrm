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
      return `<li><span class="gbp-ranking-tooltip-rank">${business.rank}.</span> ${label}</li>`;
    })
    .join("");

  const ourRow =
    ranking.ourRank != null && ranking.ourRank > 3
      ? `<div class="gbp-ranking-tooltip-ours">
          <span class="gbp-ranking-tooltip-rank">#${ranking.ourRank}</span>
          ${escapeHtml(businessName)} (You)
        </div>`
      : "";

  return `
    <div class="gbp-ranking-tooltip">
      <p class="gbp-ranking-tooltip-title">${escapeHtml(ranking.cityName)}</p>
      <ol>${topRows}</ol>
      ${ourRow}
    </div>
  `;
}
