import type { ChecklistTemplate, Division, Visit, VisitLineItem } from "@prisma/client";

type TemplateWithLinks = ChecklistTemplate & {
  lineItemLinks: { priceBookItemId: string }[];
};

type VisitContext = Pick<Visit, "division" | "isCallback"> & {
  lineItems: Pick<VisitLineItem, "priceBookItemId">[];
};

export function templateMatchesVisit(template: TemplateWithLinks, visit: VisitContext): boolean {
  if (!template.active) return false;

  if (template.excludeCallbacks && visit.isCallback) return false;

  if (!template.applyToAllJobs) {
    if (!template.divisions.length) return false;
    if (!template.divisions.includes(visit.division as Division)) return false;
  }

  const linkedIds = template.lineItemLinks.map((l) => l.priceBookItemId);
  if (linkedIds.length > 0) {
    const visitItemIds = visit.lineItems
      .map((li) => li.priceBookItemId)
      .filter((id): id is string => Boolean(id));
    const hasMatch = linkedIds.some((id) => visitItemIds.includes(id));
    if (!hasMatch) return false;
  }

  return true;
}

export function filterMatchingTemplates<T extends TemplateWithLinks>(
  templates: T[],
  visit: VisitContext
): T[] {
  return templates.filter((t) => templateMatchesVisit(t, visit));
}
