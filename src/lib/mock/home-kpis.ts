export type KpiMetric = {
  label: string;
  value: string;
  change: string;
};

export const homeKpis: KpiMetric[] = [
  { label: "Job Revenue Earned", value: "$474,426", change: "538%" },
  { label: "Jobs Completed", value: "812", change: "408%" },
  { label: "Average Job Size", value: "$584", change: "26%" },
  { label: "Total New Jobs Booked", value: "$656,626", change: "162%" },
  { label: "New Jobs Booked Online", value: "$3,015", change: "0%" },
];
