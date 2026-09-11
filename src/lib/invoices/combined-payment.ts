export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export type CombinedInvoiceDue = {
  id: string;
  balanceDue: number;
};

/** Split a combined payment across invoices, capping each at its live balance. */
export function allocateCombinedPayment(
  invoices: CombinedInvoiceDue[],
  amountPaid: number,
  plannedAmounts?: Array<{ id: string; amount: number }>
): Array<{ invoiceId: string; amount: number }> {
  const remaining = new Map(invoices.map((invoice) => [invoice.id, roundMoney(invoice.balanceDue)]));
  const byId = new Map<string, number>();
  let leftover = roundMoney(Math.max(0, amountPaid));

  const planned =
    plannedAmounts && plannedAmounts.length > 0
      ? plannedAmounts
      : invoices.map((invoice) => ({ id: invoice.id, amount: invoice.balanceDue }));

  function add(invoiceId: string, take: number) {
    if (take <= 0) return;
    byId.set(invoiceId, roundMoney((byId.get(invoiceId) ?? 0) + take));
  }

  for (const item of planned) {
    if (leftover <= 0) break;
    const due = remaining.get(item.id) ?? 0;
    const take = roundMoney(Math.min(due, Math.max(0, item.amount), leftover));
    if (take <= 0) continue;
    add(item.id, take);
    leftover = roundMoney(leftover - take);
    remaining.set(item.id, roundMoney(due - take));
  }

  if (leftover > 0) {
    for (const invoice of invoices) {
      if (leftover <= 0) break;
      const due = remaining.get(invoice.id) ?? 0;
      const take = roundMoney(Math.min(due, leftover));
      if (take <= 0) continue;
      add(invoice.id, take);
      leftover = roundMoney(leftover - take);
      remaining.set(invoice.id, roundMoney(due - take));
    }
  }

  return [...byId.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([invoiceId, amount]) => ({ invoiceId, amount }));
}

export function parseCombinedInvoiceMetadata(
  metadata: { [key: string]: string | undefined } | null | undefined
) {
  if (!metadata || metadata.checkoutType !== "multi_invoice") return null;
  const ids = (metadata.invoiceIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) return null;
  const cents = (metadata.amountsCents ?? "").split(",").map((value) => Number(value));
  return {
    companyId: metadata.companyId || null,
    customerId: metadata.customerId || null,
    planned: ids.map((id, index) => ({
      id,
      amount: Number.isFinite(cents[index]) ? cents[index] / 100 : 0,
    })),
  };
}
