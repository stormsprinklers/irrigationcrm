import { customerInvoicePayUrl, getCustomerBaseUrl } from "@/lib/company/customer-url";

/**
 * Customer-facing invoice pay URL (`/pay/[token]`).
 * This page forwards to Stripe Checkout — never put session.url in SMS, email, or QR codes.
 */
export function getPayBaseUrl(company?: { customerBaseUrl?: string | null } | null) {
  const custom = company?.customerBaseUrl?.trim();
  if (custom) return getCustomerBaseUrl(company);

  const configured =
    process.env.NEXT_PUBLIC_PAY_URL?.trim() ||
    process.env.PAY_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  return getCustomerBaseUrl(company);
}

export function getInvoicePayUrl(
  publicToken: string,
  company?: { customerBaseUrl?: string | null } | null
) {
  return customerInvoicePayUrl(company, publicToken);
}
