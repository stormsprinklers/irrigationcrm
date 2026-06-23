import type { ChecklistItemType } from "@prisma/client";

export const CHECKLIST_ITEM_TYPE_LABELS: Record<ChecklistItemType, string> = {
  PASS_FLAG_FAIL: "Pass / Flag / Fail",
  NUMBER: "Number",
  NOTE: "Note / comment",
  MEDIA: "Photo / media upload",
  MULTI_SELECT: "Multi-select",
  CHECKBOX: "Checkbox",
  SELECT_ONE: "Select one",
};

export const CHECKLIST_ITEM_TYPES = Object.keys(
  CHECKLIST_ITEM_TYPE_LABELS
) as ChecklistItemType[];

export function formatChecklistRules(template: {
  applyToAllJobs: boolean;
  divisions: string[];
  excludeCallbacks: boolean;
  priceBookItems?: { name: string }[];
}): string {
  const parts: string[] = [];
  if (template.applyToAllJobs) {
    parts.push("All jobs");
  } else if (template.divisions.length) {
    parts.push(
      template.divisions.map((d) => (d === "INSTALL" ? "Install" : "Service")).join(", ")
    );
  }
  if (template.priceBookItems?.length) {
    parts.push(`Line items: ${template.priceBookItems.map((p) => p.name).join(", ")}`);
  }
  if (template.excludeCallbacks) parts.push("Excludes callbacks");
  return parts.length ? parts.join(" · ") : "No rules configured";
}
