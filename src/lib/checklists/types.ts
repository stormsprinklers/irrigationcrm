import type { ChecklistItemType } from "@prisma/client";

export type ChecklistItemOption = {
  value: string;
  label: string;
};

export type ChecklistItemConfig = {
  min?: number;
  max?: number;
};

export type ChecklistItemResponse =
  | { value: "pass" | "flag" | "fail" }
  | { value: number }
  | { text: string }
  | { attachmentIds: string[] }
  | { values: string[] }
  | { value: string }
  | { checked: boolean };

export type ChecklistItemInput = {
  label: string;
  helpText?: string | null;
  type: ChecklistItemType;
  required?: boolean;
  sortOrder?: number;
  options?: ChecklistItemOption[] | null;
  config?: ChecklistItemConfig | null;
};

export type ChecklistTemplateInput = {
  name: string;
  description?: string | null;
  active?: boolean;
  applyToAllJobs?: boolean;
  divisions?: ("INSTALL" | "SERVICE")[];
  excludeCallbacks?: boolean;
  requiredForCompletion?: boolean;
  sortOrder?: number;
  priceBookItemIds?: string[];
  items?: ChecklistItemInput[];
};
