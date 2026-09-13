import { SerpRankingPanel } from "@/components/marketing/SerpRankingPanel";

export function GbpLocalRankingPanel({ compact = false }: { compact?: boolean }) {
  return <SerpRankingPanel variant="gbp" compact={compact} />;
}
