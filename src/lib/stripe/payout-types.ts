export type PayoutPaymentLine = {
  amountCents: number;
  customerName: string;
  paidAt: string;
  method?: string | null;
};

export type StripePayoutRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  arrivalDate: string | null;
  createdAt: string;
  method: string | null;
  description: string | null;
};

export type StripePayoutsSummary = {
  unpaidCents: number;
  pendingCents: number;
  availableCents: number;
  cashCheckExpectedCents: number;
  cashCheckPayments: PayoutPaymentLine[];
  nextPayout: StripePayoutRow | null;
  payouts: StripePayoutRow[];
};
