import type { Prisma } from "@prisma/client";

/** Preserve the approved option's aerial plan instead of always installing option A. */
export function holidayVisitPlan(raw: Prisma.JsonValue | null, letter?: string | null): Prisma.InputJsonObject | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.source !== "holiday-lighting-quote") return null;
  const options = Array.isArray(raw.options) ? raw.options : [];
  const option = options.find(value => value && typeof value === "object" && !Array.isArray(value) && value.letter === (letter || "A"));
  const chosen = option && typeof option === "object" && !Array.isArray(option) ? option : null;
  const map = chosen?.strandMap ?? raw.strandMap;
  return {
    ...raw as Prisma.InputJsonObject,
    ...(chosen?.previewImageUrl ? {previewImageUrl: chosen.previewImageUrl} : {}),
    ...(map && typeof map === "object" && !Array.isArray(map) ? {strandMap: {
      ...map as Prisma.InputJsonObject,
      features: Array.isArray(map.features) ? map.features.map(feature => {
        if (!feature || typeof feature !== "object" || Array.isArray(feature)) return feature;
        return {...feature, ...(feature.bulbColors ? {} : chosen?.colorPattern ? {bulbColors: `Default: ${chosen.colorPattern}`} : {})};
      }) : [],
    }} : {}),
    ...(letter ? {approvedOptionLetter: letter} : {}),
  };
}
