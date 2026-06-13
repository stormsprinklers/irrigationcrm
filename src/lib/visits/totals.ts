import type { DiscountType } from "@prisma/client";

type LineItemLike = { quantity: unknown; unitPrice: unknown; total: unknown };
type DiscountLike = { type: DiscountType; amount: unknown };

export function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

export function computeLineItemTotal(quantity: number, unitPrice: number) {
  return Math.round(quantity * unitPrice * 100) / 100;
}

export function sumLineItems(items: LineItemLike[]) {
  return items.reduce((sum, item) => sum + toNumber(item.total), 0);
}

export function sumDiscounts(subtotal: number, discounts: DiscountLike[]) {
  return discounts.reduce((sum, discount) => {
    const amount = toNumber(discount.amount);
    if (discount.type === "PERCENT") {
      return sum + (subtotal * amount) / 100;
    }
    return sum + amount;
  }, 0);
}

export function computeTotals(subtotal: number, discountTotal: number, tax = 0) {
  const total = Math.max(0, subtotal - discountTotal + tax);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
