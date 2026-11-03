import type { Prisma } from "@prisma/client";

type HolidayVisitLine = {
  name: string;
  description?: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function specifiedColor(value: unknown) {
  if (typeof value !== "string") return null;
  const color = value.trim().replace(/^Default:\s*/i, "");
  return color && !/^other$/i.test(color) ? color : null;
}

function lineItemColors(lines: HolidayVisitLine[]) {
  const colors: string[] = [];
  for (const line of lines) {
    const description = line.description?.trim();
    if (!description) continue;
    const match = description.match(
      /(?:C7|C9|LightStream(?: \(Color-Changing\))?|Permanent|Mini LEDs)\s*·\s*([^.;\n]+)/i
    );
    const color = specifiedColor(match?.[1]);
    if (color && !colors.includes(color)) colors.push(color);
  }
  return colors;
}

export type HolidayVisitJobSummary = {
  totalFeet: number | null;
  colors: string[];
  colorLabel: string;
};

/** Internal installer summary with fallbacks for every holiday metadata version. */
export function holidayVisitJobSummary(
  raw: Prisma.JsonValue | Record<string, unknown> | null | undefined,
  lines: HolidayVisitLine[] = []
): HolidayVisitJobSummary | null {
  const root = record(raw);
  if (!root || root.source !== "holiday-lighting-quote") return null;
  const approvedLetter =
    typeof root.approvedOptionLetter === "string" ? root.approvedOptionLetter : "A";
  const plan = holidayVisitPlan(root as Prisma.JsonValue, approvedLetter);
  const normalized = record(plan) ?? root;
  const map = record(normalized.strandMap);
  const features = Array.isArray(map?.features)
    ? map.features.map(record).filter((feature): feature is Record<string, unknown> => Boolean(feature))
    : [];

  const metadataFeet = Number(normalized.billedLengthFt);
  const mapFeet = features.reduce((total, feature) => {
    const length = Number(feature.lengthFtWithMargin);
    return total + (Number.isFinite(length) && length > 0 ? length : 0);
  }, 0);
  const totalFeet = Number.isFinite(metadataFeet) && metadataFeet > 0
    ? Math.round(metadataFeet * 10) / 10
    : mapFeet > 0
      ? Math.round(mapFeet * 10) / 10
      : null;

  const selectedColor = specifiedColor(normalized.colorPattern);
  const colors = selectedColor ? [selectedColor] : [];
  const legacyLineColors = lineItemColors(lines);
  const fallbackMapColors = features
    .map((feature) => specifiedColor(feature.bulbColors))
    .filter((color): color is string => Boolean(color));

  // The approved option is authoritative. Older maps and copied line items may
  // still contain the option's previous color (commonly Warm White).
  for (const color of selectedColor ? [] : [...legacyLineColors, ...fallbackMapColors]) {
    if (!colors.includes(color)) colors.push(color);
  }

  const literalOther =
    typeof normalized.colorPattern === "string" && /^other$/i.test(normalized.colorPattern.trim());
  return {
    totalFeet,
    colors,
    colorLabel:
      colors.join("; ") ||
      (literalOther ? "Custom color — details not specified" : "Not specified"),
  };
}

/** Preserve the approved option's aerial plan instead of always installing option A. */
export function holidayVisitPlan(raw: Prisma.JsonValue | null, letter?: string | null): Prisma.InputJsonObject | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.source !== "holiday-lighting-quote") return null;
  const options = Array.isArray(raw.options) ? raw.options : [];
  const option = options.find(value => value && typeof value === "object" && !Array.isArray(value) && value.letter === (letter || "A"));
  const chosen = option && typeof option === "object" && !Array.isArray(option) ? option : null;
  const map = chosen?.strandMap ?? raw.strandMap;
  return {
    ...raw as Prisma.InputJsonObject,
    ...(typeof chosen?.notes === "string" ? { notes: chosen.notes } : {}),
    ...(typeof chosen?.colorPattern === "string" ? { colorPattern: chosen.colorPattern } : {}),
    ...(typeof chosen?.billedLengthFt === "number" ? { billedLengthFt: chosen.billedLengthFt } : {}),
    ...(chosen?.previewImageUrl ? {previewImageUrl: chosen.previewImageUrl} : {}),
    ...(map && typeof map === "object" && !Array.isArray(map) ? {strandMap: {
      ...map as Prisma.InputJsonObject,
      features: Array.isArray(map.features) ? map.features.map(feature => {
        if (!feature || typeof feature !== "object" || Array.isArray(feature)) return feature;
        return {...feature, ...(feature.bulbColors ? {} : chosen?.colorPattern ? {bulbColors: chosen.colorPattern} : {})};
      }) : [],
    }} : {}),
    ...(letter ? {approvedOptionLetter: letter} : {}),
  };
}
