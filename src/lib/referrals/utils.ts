import { randomBytes } from "crypto";
import { getAppBaseUrl } from "@/lib/app-url";

export function generateReferralToken() {
  return randomBytes(16).toString("hex");
}

export function buildReferralShareUrl(params: {
  portalSlug: string;
  memberToken: string;
  origin?: string | null;
}) {
  const base = getAppBaseUrl(params.origin);
  return `${base}/refer/${params.portalSlug}/${params.memberToken}`;
}

export function isDepositInvoice(invoiceNumber: string) {
  return invoiceNumber.includes("-DEP-");
}

export function formatCentsAsDollars(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function parseDollarsToCents(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}
