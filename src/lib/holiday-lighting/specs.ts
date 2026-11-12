import { HOLIDAY_STRAND_COLORS } from "@/lib/holiday-lighting/types";

export type HolidayLightingSpecPatch = {
  strandColor?: string;
  colorPattern?: string;
};

export class HolidayLightingSpecError extends Error {}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseHolidayLightingSpecPatch(body: unknown): HolidayLightingSpecPatch {
  const input = record(body) ?? {};
  const patch: HolidayLightingSpecPatch = {};

  if (input.strandColor !== undefined) {
    if (
      typeof input.strandColor !== "string" ||
      !HOLIDAY_STRAND_COLORS.includes(
        input.strandColor as (typeof HOLIDAY_STRAND_COLORS)[number]
      )
    ) {
      throw new HolidayLightingSpecError("Strand color must be Black, White, or Green");
    }
    patch.strandColor = input.strandColor;
  }

  if (input.colorPattern !== undefined) {
    const colorPattern = String(input.colorPattern).trim();
    if (!colorPattern || colorPattern.length > 120 || /^other$/i.test(colorPattern)) {
      throw new HolidayLightingSpecError("Enter a specific light color or pattern");
    }
    patch.colorPattern = colorPattern;
  }

  if (patch.strandColor === undefined && patch.colorPattern === undefined) {
    throw new HolidayLightingSpecError(
      "Choose a strand color or light color pattern to update"
    );
  }
  return patch;
}

function applyToPlan(
  plan: Record<string, unknown>,
  patch: HolidayLightingSpecPatch
): Record<string, unknown> {
  const next = { ...plan };
  if (patch.strandColor !== undefined) next.strandColor = patch.strandColor;
  if (patch.colorPattern !== undefined) {
    next.colorPattern = patch.colorPattern;
    const strandMap = record(next.strandMap);
    if (strandMap && Array.isArray(strandMap.features)) {
      next.strandMap = {
        ...strandMap,
        features: strandMap.features.map((feature) => {
          const item = record(feature);
          return item ? { ...item, bulbColors: patch.colorPattern } : feature;
        }),
      };
    }
  }
  return next;
}

export function updateHolidayLightingSpecs(
  raw: unknown,
  patch: HolidayLightingSpecPatch,
  options: { optionLetter?: string; markVisitOverride?: boolean } = {}
): Record<string, unknown> {
  const root = record(raw);
  if (!root || root.source !== "holiday-lighting-quote") {
    throw new HolidayLightingSpecError(
      "This record is not linked to a holiday lighting estimate"
    );
  }

  if (options.optionLetter) {
    const plans = Array.isArray(root.options) ? root.options : [];
    let found = false;
    const updatedPlans = plans.map((value) => {
      const plan = record(value);
      if (!plan || plan.letter !== options.optionLetter) return value;
      found = true;
      return applyToPlan(plan, patch);
    });
    if (!found) {
      throw new HolidayLightingSpecError(
        "The selected holiday lighting option was not found"
      );
    }
    return { ...root, options: updatedPlans };
  }

  const next = applyToPlan(root, patch);
  if (options.markVisitOverride) next.visitSpecsUpdated = true;
  return next;
}
