export type RankingTier = "top3" | "mid" | "low" | "none";

export function getRankingTier(rank: number | null): RankingTier {
  if (rank == null) return "none";
  if (rank <= 3) return "top3";
  if (rank <= 7) return "mid";
  return "low";
}

export const RANKING_TIER_COLORS: Record<RankingTier, string> = {
  top3: "#22c55e",
  mid: "#f97316",
  low: "#ef4444",
  none: "#94a3b8",
};

export const RANKING_TIER_LABELS: Record<RankingTier, string> = {
  top3: "Top 3",
  mid: "Ranks 4–7",
  low: "Rank 8+",
  none: "Not in results",
};

export function formatRankLabel(rank: number | null) {
  if (rank == null) return "NF";
  return String(rank);
}
