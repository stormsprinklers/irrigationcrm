export type SummaryCardData = {
  title: string;
  highlight?: {
    label: string;
    value: string;
  };
  emptyMessage?: string;
  linkLabel: string;
};

export const homeSummaryCards: SummaryCardData[] = [
  {
    title: "Estimates",
    highlight: {
      label: "49 Open estimates",
      value: "$304,181.52",
    },
    linkLabel: "View all estimates",
  },
  {
    title: "Jobs",
    highlight: {
      label: "2 Unscheduled jobs",
      value: "$5,162.20",
    },
    linkLabel: "View all jobs",
  },
  {
    title: "Invoices",
    highlight: {
      label: "2 Open invoices",
      value: "$2,604.48",
    },
    linkLabel: "View all invoices",
  },
  {
    title: "Maintenance Plans",
    emptyMessage: "You're all caught up! 0 unscheduled service visits.",
    linkLabel: "Manage visits",
  },
];
