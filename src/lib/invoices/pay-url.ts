/**
 * Fallback CRM invoice page (`/pay/[token]`). Prefer Stripe Checkout `session.url`
 * from createInvoiceCheckoutSession / createStripeCheckoutPayUrl for customer pay links.
 * Stripe custom domains brand session.url automatically once DNS finishes — no CRM change needed.
 */
export function getPayBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_PAY_URL?.trim() ||
    process.env.PAY_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function getInvoicePayUrl(publicToken: string) {
  return `${getPayBaseUrl()}/pay/${publicToken}`;
}
