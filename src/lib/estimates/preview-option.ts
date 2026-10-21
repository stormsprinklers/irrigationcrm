export type EstimatePreviewOptionTotals = {
  id: string;
  subtotal: number;
  discountTotal: number;
  total: number;
};

export function defaultEstimatePreviewOption<T extends EstimatePreviewOptionTotals>(
  options: T[],
  selectedOptionId: string | null | undefined
) {
  return options.find((option) => option.id === selectedOptionId) ?? options[0] ?? null;
}

export function estimatePreviewTotals(
  estimate: { subtotal: number; discountTotal: number; total: number },
  option: EstimatePreviewOptionTotals | null
) {
  return option
    ? {
        subtotal: option.subtotal,
        discountTotal: option.discountTotal,
        total: option.total,
      }
    : {
        subtotal: estimate.subtotal,
        discountTotal: estimate.discountTotal,
        total: estimate.total,
      };
}
