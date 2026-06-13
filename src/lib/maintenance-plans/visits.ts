import type { PlanVisitSeason } from "@prisma/client";

export type VisitTemplateInput = {
  id: string;
  name: string;
  season: PlanVisitSeason;
  defaultMonth: number;
  visitTitle: string;
  description: string | null;
  estimatedMinutes: number;
  sortOrder: number;
};

export function generatePlanVisitRows(
  visitTemplates: VisitTemplateInput[],
  planYear: number
) {
  return visitTemplates.map((tpl) => ({
    visitTemplateId: tpl.id,
    dueYear: planYear,
    dueMonth: tpl.defaultMonth,
    status: "UNSCHEDULED" as const,
  }));
}

export function markOverduePlanVisits(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month };
}

export const SEASON_PRESETS: Array<{
  season: PlanVisitSeason;
  name: string;
  visitTitle: string;
  defaultMonth: number;
}> = [
  { season: "SPRING", name: "Spring Activation", visitTitle: "Spring system activation", defaultMonth: 3 },
  { season: "SUMMER", name: "Summer Tune-up", visitTitle: "Summer system checkup", defaultMonth: 7 },
  { season: "FALL", name: "Fall Winterization", visitTitle: "Fall system winterization", defaultMonth: 10 },
];
