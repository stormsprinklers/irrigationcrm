export const ASSET_TYPES = ["VEHICLE", "EQUIPMENT"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export function isAssetType(value: unknown): value is AssetType {
  return value === "VEHICLE" || value === "EQUIPMENT";
}

export function normalizeAssetType(value: unknown): AssetType {
  return value === "EQUIPMENT" ? "EQUIPMENT" : "VEHICLE";
}

export function parseEstimatedValueCents(value: unknown) {
  if (value == null || value === "") {
    return { value: null as number | null };
  }

  const dollars = Number(value);
  const cents = Math.round(dollars * 100);
  if (!Number.isFinite(dollars) || dollars < 0 || !Number.isSafeInteger(cents)) {
    return { error: "Estimated value must be a valid non-negative amount" };
  }
  if (cents > 2_147_483_647) {
    return { error: "Estimated value is too large" };
  }
  return { value: cents };
}

export function formatEstimatedValue(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
