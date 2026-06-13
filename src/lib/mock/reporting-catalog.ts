export type ReportCategory = {
  title: string;
  links: string[];
};

export const jobsReportCategories: ReportCategory[] = [
  {
    title: "Date",
    links: [
      "Job revenue earned",
      "Average job size",
      "Job count",
      "Daily",
      "Weekly",
      "Monthly",
    ],
  },
  {
    title: "Customer",
    links: [
      "Customer name",
      "Customer lead source",
      "Rating and reviews",
      "Zip code",
    ],
  },
  {
    title: "Job Costing",
    links: [
      "Profit by date",
      "Profit by business unit",
      "Profit by job type",
      "Expected costs by date",
    ],
  },
  {
    title: "Paid in Full Jobs",
    links: ["Daily (by paid in full date)", "Weekly (by paid in full date)"],
  },
  {
    title: "Type",
    links: ["Job tags", "Job lead source", "Business unit", "Job type"],
  },
  {
    title: "Employee",
    links: [
      "Tech leaderboard",
      "On job sales by employee",
      "Commissions",
      "Estimates on jobs",
    ],
  },
];
