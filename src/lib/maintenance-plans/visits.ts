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

function isWinterizationLabel(value: string | null | undefined) {
  return /winteriz/i.test(value ?? "");
}

/** True when the plan includes a fall/winterization visit or a selected winterization addon. */
export function planIncludesWinterization(input: {
  visitTemplates?: Array<{ season?: string; name?: string | null; visitTitle?: string | null }>;
  addons?: Array<{ id: string; name: string }>;
  selectedAddonIds?: string[];
}) {
  const visits = input.visitTemplates ?? [];
  if (
    visits.some(
      (visit) =>
        visit.season === "FALL" ||
        isWinterizationLabel(visit.name) ||
        isWinterizationLabel(visit.visitTitle)
    )
  ) {
    return true;
  }

  const addons = input.addons ?? [];
  const selected = new Set(input.selectedAddonIds ?? []);
  const relevant = selected.size > 0 ? addons.filter((addon) => selected.has(addon.id)) : [];
  return relevant.some((addon) => isWinterizationLabel(addon.name));
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
