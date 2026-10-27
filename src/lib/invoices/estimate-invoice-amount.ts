export type EstimateInvoiceAmountSelection =
  | { type: "PERCENT"; value: number }
  | { type: "FIXED"; value: number };

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resolveEstimateInvoiceBalance(
  remainingBalance: number,
  selection?: EstimateInvoiceAmountSelection
) {
  const remaining = roundCurrency(Math.max(0, remainingBalance));
  if (remaining <= 0) {
    return { ok: false as const, error: "This estimate is already paid" };
  }

  if (!selection) {
    return { ok: true as const, amount: remaining };
  }

  if (!Number.isFinite(selection.value) || selection.value <= 0) {
    return {
      ok: false as const,
      error: selection.type === "PERCENT"
        ? "Enter a percentage greater than zero."
        : "Enter an invoice amount greater than zero.",
    };
  }

  if (selection.type === "PERCENT" && selection.value > 100) {
    return { ok: false as const, error: "The invoice percentage cannot exceed 100%." };
  }

  const amount = roundCurrency(
    selection.type === "PERCENT"
      ? remaining * (selection.value / 100)
      : selection.value
  );
  if (amount <= 0) {
    return { ok: false as const, error: "The invoice amount must be at least $0.01." };
  }
  if (amount > remaining) {
    return {
      ok: false as const,
      error: `The invoice amount cannot exceed the remaining balance of $${remaining.toFixed(2)}.`,
    };
  }

  return { ok: true as const, amount };
}
