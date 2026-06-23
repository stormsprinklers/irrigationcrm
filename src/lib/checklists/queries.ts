import type { ChecklistTemplate, ChecklistItemTemplate, ChecklistTemplateLineItem, PriceBookItem } from "@prisma/client";

type TemplateWithRelations = ChecklistTemplate & {
  items: ChecklistItemTemplate[];
  lineItemLinks: (ChecklistTemplateLineItem & {
    priceBookItem: Pick<PriceBookItem, "id" | "name" | "type">;
  })[];
};

export function serializeChecklistTemplate(template: TemplateWithRelations) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    active: template.active,
    applyToAllJobs: template.applyToAllJobs,
    divisions: template.divisions,
    excludeCallbacks: template.excludeCallbacks,
    requiredForCompletion: template.requiredForCompletion,
    sortOrder: template.sortOrder,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    items: template.items.map((item) => ({
      id: item.id,
      label: item.label,
      helpText: item.helpText,
      type: item.type,
      required: item.required,
      sortOrder: item.sortOrder,
      options: item.options,
      config: item.config,
    })),
    priceBookItems: template.lineItemLinks.map((link) => ({
      id: link.priceBookItem.id,
      name: link.priceBookItem.name,
      type: link.priceBookItem.type,
    })),
    priceBookItemIds: template.lineItemLinks.map((l) => l.priceBookItemId),
  };
}

export const checklistTemplateInclude = {
  items: { orderBy: { sortOrder: "asc" as const } },
  lineItemLinks: {
    include: {
      priceBookItem: { select: { id: true, name: true, type: true } },
    },
  },
};
