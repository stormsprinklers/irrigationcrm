/**
 * Base URL for customer-facing payment pages and Stripe-related pay links.
 * Prefer the custom pay domain (pay.stormsprinklers.com) in production.
 */
export function getPayBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_PAY_URL?.trim() ||
    process.env.PAY_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // Production default: custom Stripe / pay domain
  if (process.env.NODE_ENV === "production") {
    return "https://pay.stormsprinklers.com";
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function getInvoicePayUrl(publicToken: string) {
  return `${getPayBaseUrl()}/pay/${publicToken}`;
}
