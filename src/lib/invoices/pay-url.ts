/**
 * Customer-facing invoice pay URL (`/pay/[token]`).
 * This page forwards to Stripe Checkout — never put session.url in SMS, email, or QR codes.
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
