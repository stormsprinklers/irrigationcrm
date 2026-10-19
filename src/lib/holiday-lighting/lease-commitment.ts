export type HolidayLeaseCommitmentYears = 1 | 3 | 5;

export type HolidayLeaseDiscount = {
  optionId?: string | null;
  label: string | null;
  type: string;
  amount: number;
};

export const HOLIDAY_LEASE_COMMITMENTS: ReadonlyArray<{
  years: HolidayLeaseCommitmentYears;
  label: string;
  discountPercent: number;
}> = [
  { years: 1, label: "No commitment", discountPercent: 0 },
  { years: 3, label: "3-year commitment (10%)", discountPercent: 10 },
  { years: 5, label: "5-year commitment (20%)", discountPercent: 20 },
];

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function parseHolidayLeaseCommitmentYears(
  value: unknown
): HolidayLeaseCommitmentYears {
  return Number(value) === 3 ? 3 : Number(value) === 5 ? 5 : 1;
}

export function holidayLeaseCommitmentDiscountPercent(
  years: HolidayLeaseCommitmentYears
) {
  return years === 5 ? 20 : years === 3 ? 10 : 0;
}

export function isHolidayLeaseCommitmentDiscount(discount: { label: string | null }) {
  return /^\d+-year (?:lease agreement|commitment) discount$/i.test(
    discount.label?.trim() ?? ""
  );
}

export function holidayLeaseCommitmentDiscount(
  optionId: string,
  years: HolidayLeaseCommitmentYears
): HolidayLeaseDiscount | null {
  const amount = holidayLeaseCommitmentDiscountPercent(years);
  return amount > 0
    ? {
        optionId,
        label: `${years}-year commitment discount`,
        type: "PERCENT",
        amount,
      }
    : null;
}

export function holidayLeaseCommitmentTagline(years: HolidayLeaseCommitmentYears) {
  return years === 5
    ? "5-Year Commitment · Save 20% Each Year"
    : years === 3
      ? "3-Year Commitment · Save 10% Each Year"
      : "No Commitment";
}

export function withHolidayLeaseCommitmentDescription(
  description: string | null,
  years: HolidayLeaseCommitmentYears
) {
  const tagline = holidayLeaseCommitmentTagline(years);
  const text = description?.trim() ?? "";
  if (!text) return tagline;
  const separator = text.indexOf("\n\n");
  return separator === -1 ? `${tagline}\n\n${text}` : `${tagline}${text.slice(separator)}`;
}

export function calculateHolidayLeaseCommitmentPricing(params: {
  subtotal: number;
  years: HolidayLeaseCommitmentYears;
  discounts: HolidayLeaseDiscount[];
}) {
  const subtotal = money(Math.max(0, params.subtotal));
  const contractDiscountPercent = holidayLeaseCommitmentDiscountPercent(params.years);
  const contractDiscountTotal = money((subtotal * contractDiscountPercent) / 100);
  const manualDiscountTotal = money(
    Math.min(
      subtotal - contractDiscountTotal,
      params.discounts
        .filter((discount) => !isHolidayLeaseCommitmentDiscount(discount))
        .reduce((sum, discount) => {
          const amount =
            discount.type.toUpperCase() === "PERCENT"
              ? (subtotal * discount.amount) / 100
              : discount.amount;
          return sum + Math.max(0, amount);
        }, 0)
    )
  );
  const discountTotal = money(contractDiscountTotal + manualDiscountTotal);
  return {
    subtotal,
    contractDiscountPercent,
    contractDiscountTotal,
    manualDiscountTotal,
    discountTotal,
    total: money(Math.max(0, subtotal - discountTotal)),
  };
}
