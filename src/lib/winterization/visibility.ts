import { irrigationFeaturesEnabled } from "@/lib/company/features";

export type WinterizationTabCompany = {
  irrigationFeaturesEnabled?: boolean | null;
  winterizationTabMode?: "OFF" | "ON" | "SCHEDULED" | null;
  winterizationTabStartMonth?: number | null;
  winterizationTabStartDay?: number | null;
  winterizationTabEndMonth?: number | null;
  winterizationTabEndDay?: number | null;
};

function inWindow(
  now: Date,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number
) {
  const year = now.getFullYear();
  const start = new Date(year, startMonth - 1, startDay, 0, 0, 0);
  const end = new Date(year, endMonth - 1, endDay, 23, 59, 59);
  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end;
}

export function winterizationTabVisible(
  company: WinterizationTabCompany | null | undefined,
  now = new Date()
) {
  if (!irrigationFeaturesEnabled(company)) return false;
  const mode = company?.winterizationTabMode ?? "SCHEDULED";
  if (mode === "OFF") return false;
  if (mode === "ON") return true;
  return inWindow(
    now,
    company?.winterizationTabStartMonth || 8,
    company?.winterizationTabStartDay || 1,
    company?.winterizationTabEndMonth || 11,
    company?.winterizationTabEndDay || 15
  );
}
