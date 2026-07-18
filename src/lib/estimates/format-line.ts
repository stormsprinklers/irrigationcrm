/** Format estimate line qty/price as: Qty 12 @$1.50/ft */
export function formatEstimateLineQtyPrice(params: {
  quantity: number;
  unitPrice: number;
  unit?: string | null;
  currency?: (value: number) => string;
}) {
  const unit = (params.unit?.trim() || "each").toLowerCase();
  const formatCurrency =
    params.currency ??
    ((value: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value));

  const qty =
    Number.isInteger(params.quantity) || Math.abs(params.quantity - Math.round(params.quantity)) < 1e-9
      ? String(Math.round(params.quantity))
      : String(params.quantity);

  return `Qty ${qty} @${formatCurrency(params.unitPrice)}/${unit}`;
}
