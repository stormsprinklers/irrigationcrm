type StripeChargeErrorLike = {
  code?: string;
  decline_code?: string;
  payment_intent?: { status?: string };
  raw?: {
    code?: string;
    decline_code?: string;
    payment_intent?: { status?: string };
  };
};

export function cardOnFileIdempotencyKey(params: {
  invoiceId: string;
  balanceCents: number;
  amountCents: number;
}) {
  return [
    "invoice-card-on-file",
    params.invoiceId,
    Math.round(params.balanceCents),
    Math.round(params.amountCents),
  ].join(":");
}

export function classifyCardOnFileError(error: unknown) {
  const stripeError = error as StripeChargeErrorLike;
  const code = stripeError.code ?? stripeError.raw?.code;
  const status =
    stripeError.payment_intent?.status ?? stripeError.raw?.payment_intent?.status;
  return {
    needsCustomer: code === "authentication_required" || status === "requires_action",
    declineCode: stripeError.decline_code ?? stripeError.raw?.decline_code ?? null,
  };
}
