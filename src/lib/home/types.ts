export type HomeDateRange = "ytd" | "mtd" | "last30";

export type HomeSummaryCard = {
  title: string;
  highlight?: { label: string; value: string };
  emptyMessage?: string;
  linkLabel: string;
  href: string;
};

export type HomeKpi = {
  label: string;
  value: string;
  change: string;
};

export type HomeSummaryDTO = {
  greeting: string;
  cards: HomeSummaryCard[];
  kpis: HomeKpi[];
  dateRange: HomeDateRange;
};
