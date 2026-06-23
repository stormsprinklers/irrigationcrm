import {
  ChecklistItemType,
  Prisma,
  type VisitChecklist,
  type VisitChecklistItem,
  VisitChecklistStatus,
} from "@prisma/client";
import type { ChecklistItemConfig, ChecklistItemOption, ChecklistItemResponse } from "@/lib/checklists/types";

function parseOptions(options: unknown): ChecklistItemOption[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => {
      if (typeof o !== "object" || !o) return null;
      const value = String((o as { value?: unknown }).value ?? "").trim();
      const label = String((o as { label?: unknown }).label ?? value).trim();
      if (!value) return null;
      return { value, label };
    })
    .filter(Boolean) as ChecklistItemOption[];
}

function parseConfig(config: unknown): ChecklistItemConfig {
  if (typeof config !== "object" || !config) return {};
  const c = config as ChecklistItemConfig;
  return {
    min: typeof c.min === "number" ? c.min : undefined,
    max: typeof c.max === "number" ? c.max : undefined,
  };
}

export function isValidItemResponse(
  item: Pick<VisitChecklistItem, "type" | "required" | "options" | "config">,
  response: unknown
): boolean {
  if (response == null || typeof response !== "object") {
    return !item.required;
  }

  const r = response as ChecklistItemResponse;
  const options = parseOptions(item.options);
  const config = parseConfig(item.config);

  switch (item.type) {
    case ChecklistItemType.PASS_FLAG_FAIL: {
      const value = (r as { value?: string }).value;
      return value === "pass" || value === "flag" || value === "fail";
    }
    case ChecklistItemType.NUMBER: {
      const value = Number((r as { value?: unknown }).value);
      if (!Number.isFinite(value)) return !item.required;
      if (config.min != null && value < config.min) return false;
      if (config.max != null && value > config.max) return false;
      return true;
    }
    case ChecklistItemType.NOTE: {
      const text = String((r as { text?: unknown }).text ?? "").trim();
      return text.length > 0 || !item.required;
    }
    case ChecklistItemType.MEDIA: {
      const ids = (r as { attachmentIds?: unknown }).attachmentIds;
      const count = Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && id).length : 0;
      return count > 0 || !item.required;
    }
    case ChecklistItemType.MULTI_SELECT: {
      const values = (r as { values?: unknown }).values;
      if (!Array.isArray(values)) return !item.required;
      const allowed = new Set(options.map((o) => o.value));
      const valid = values.every((v) => typeof v === "string" && allowed.has(v));
      return valid && (values.length > 0 || !item.required);
    }
    case ChecklistItemType.SELECT_ONE: {
      const value = String((r as { value?: unknown }).value ?? "");
      const allowed = new Set(options.map((o) => o.value));
      return allowed.has(value) || (!item.required && !value);
    }
    case ChecklistItemType.CHECKBOX: {
      const checked = Boolean((r as { checked?: unknown }).checked);
      return checked || !item.required;
    }
    default:
      return false;
  }
}

export function computeChecklistStatus(
  items: Pick<VisitChecklistItem, "required" | "response" | "type" | "options" | "config">[]
): VisitChecklistStatus {
  if (!items.length) return VisitChecklistStatus.COMPLETED;

  const hasAnyResponse = items.some((item) => item.response != null);
  const allRequiredValid = items
    .filter((item) => item.required)
    .every((item) => isValidItemResponse(item, item.response));
  const allResponsesValid = items.every(
    (item) => item.response == null || isValidItemResponse(item, item.response)
  );

  if (allRequiredValid && allResponsesValid) {
    return VisitChecklistStatus.COMPLETED;
  }
  if (hasAnyResponse) return VisitChecklistStatus.IN_PROGRESS;
  return VisitChecklistStatus.NOT_STARTED;
}

export function validateResponseForType(
  type: ChecklistItemType,
  response: unknown,
  options: Prisma.JsonValue | null,
  config: Prisma.JsonValue | null
): { ok: true; response: ChecklistItemResponse } | { ok: false; error: string } {
  const item = {
    type,
    required: true,
    options,
    config,
  };
  if (!isValidItemResponse(item, response)) {
    return { ok: false, error: "Invalid response for this item type" };
  }
  return { ok: true, response: response as ChecklistItemResponse };
}

type ChecklistWithItems = VisitChecklist & {
  items: VisitChecklistItem[];
};

export function checklistIsComplete(checklist: ChecklistWithItems): boolean {
  return checklist.items
    .filter((item) => item.required)
    .every((item) => isValidItemResponse(item, item.response));
}

export function getIncompleteMandatoryChecklistNames(checklists: ChecklistWithItems[]): string[] {
  return checklists
    .filter((c) => c.requiredForCompletion)
    .filter((c) => !checklistIsComplete(c))
    .map((c) => c.name);
}

export async function assertVisitChecklistsComplete(
  visitId: string,
  loadChecklists: (visitId: string) => Promise<ChecklistWithItems[]>
): Promise<string | null> {
  const checklists = await loadChecklists(visitId);
  const incomplete = getIncompleteMandatoryChecklistNames(checklists);
  if (!incomplete.length) return null;
  return `Complete required checklists before finishing: ${incomplete.join(", ")}`;
}
