type CustomerFacingLine = {
  name: string;
  total: number;
  quantity: number;
  unitPrice: number;
  unit?: string | null;
};

const INTERNAL_ADJUSTMENT_NAMES = new Set([
  "quote adjustment",
  "labor minimum adjustment",
]);

/**
 * Hide legacy internal reconciliation rows while preserving the displayed
 * subtotal by folding their value into the corresponding roofline row.
 */
export function customerFacingEstimateLines<T extends CustomerFacingLine>(items: T[]): T[] {
  let adjustment = 0;
  let laborOnlyAdjustment = false;
  const visible: T[] = [];
  const permanentHolidayOption = items.some(
    (item) =>
      item.unit?.trim().toLowerCase() === "included" &&
      /^5-year parts and labor warranty$/i.test(item.name.trim())
  );

  for (const item of items) {
    const normalizedName = item.name.trim().toLowerCase();
    if (
      permanentHolidayOption &&
      item.unit?.trim().toLowerCase() === "included" &&
      (normalizedName === "storage" || normalizedName === "maintenance")
    ) {
      continue;
    }
    if (INTERNAL_ADJUSTMENT_NAMES.has(normalizedName)) {
      adjustment += item.total;
      laborOnlyAdjustment ||= normalizedName === "labor minimum adjustment";
      continue;
    }
    visible.push(item);
  }

  if (adjustment === 0 || visible.length === 0) return visible;
  const preferredName = laborOnlyAdjustment ? "roofline — labor only" : "roofline — parts";
  const targetIndex = visible.findIndex(
    (item) => item.name.trim().toLowerCase() === preferredName
  );
  const index = targetIndex >= 0 ? targetIndex : 0;
  const target = visible[index]!;
  const total = Math.round((target.total + adjustment) * 100) / 100;
  const quantity = target.quantity || 1;
  visible[index] = {
    ...target,
    total,
    unitPrice: Math.round((total / quantity) * 100) / 100,
  };
  return visible;
}
