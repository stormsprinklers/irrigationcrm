import type { VisitChecklist, VisitChecklistItem } from "@prisma/client";
import { isValidItemResponse } from "@/lib/checklists/validation";

export function serializeVisitChecklistItem(item: VisitChecklistItem) {
  return {
    id: item.id,
    label: item.label,
    helpText: item.helpText,
    type: item.type,
    required: item.required,
    sortOrder: item.sortOrder,
    options: item.options,
    config: item.config,
    response: item.response,
    completedAt: item.completedAt?.toISOString() ?? null,
  };
}

export function serializeVisitChecklist(
  checklist: VisitChecklist & { items: VisitChecklistItem[] }
) {
  const requiredItems = checklist.items.filter((i) => i.required);
  const requiredComplete = requiredItems.filter((i) =>
    isValidItemResponse(i, i.response)
  ).length;

  return {
    id: checklist.id,
    templateId: checklist.templateId,
    name: checklist.name,
    requiredForCompletion: checklist.requiredForCompletion,
    status: checklist.status,
    appliedAt: checklist.appliedAt.toISOString(),
    completedAt: checklist.completedAt?.toISOString() ?? null,
    progress: {
      requiredComplete,
      requiredTotal: requiredItems.length,
      itemCount: checklist.items.length,
    },
    items: checklist.items.map(serializeVisitChecklistItem),
  };
}
