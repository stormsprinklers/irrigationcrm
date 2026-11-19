import { holidayStrandMapFromMetadata } from "@/lib/holiday-lighting/strand-map";

export type BulbPrepRequirement = {
  bulbType: string;
  bulbColor: string;
  linearFeet: number | null;
};

export function buildBulbPrepRequirements(
  plan: Record<string, unknown> | null,
  fallback: { bulbColor: string; linearFeet: number | null }
): BulbPrepRequirement[] {
  const map = holidayStrandMapFromMetadata(plan);
  const grouped = new Map<string, BulbPrepRequirement>();

  for (const feature of map?.features ?? []) {
    const bulbType = feature.lightStyleLabel?.trim() || "Bulbs";
    const bulbColor = feature.bulbColors?.trim() || fallback.bulbColor;
    const key = `${bulbType}\u0000${bulbColor}`;
    const current = grouped.get(key);
    const feet = Number.isFinite(feature.lengthFtWithMargin) && feature.lengthFtWithMargin > 0
      ? feature.lengthFtWithMargin
      : 0;
    grouped.set(key, {
      bulbType,
      bulbColor,
      linearFeet: current?.linearFeet != null
        ? Math.round((current.linearFeet + feet) * 10) / 10
        : feet > 0
          ? Math.round(feet * 10) / 10
          : null,
    });
  }

  if (grouped.size) return [...grouped.values()];
  return [{
    bulbType: "Bulbs",
    bulbColor: fallback.bulbColor,
    linearFeet: fallback.linearFeet,
  }];
}
