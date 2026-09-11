import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/app-url";
import {
  portalForbiddenResponse,
  portalUnauthorizedResponse,
  requirePortalCustomer,
} from "@/lib/portal/auth";
import { resolvePortalSlug } from "@/lib/portal/company";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { getPortalBillingSummary } from "@/lib/portal/billing-summary";
import { createCombinedInvoiceCheckoutSession } from "@/lib/stripe/invoice-checkout";

function safeReturnPath(value: unknown, slug: string) {
  const fallback = `/portal/${slug}/pay`;
  if (typeof value !== "string") return fallback;
  const path = value.split("?")[0];
  if (!path.startsWith(`/portal/${slug}`)) return fallback;
  if (path.includes("://") || path.includes("\\")) return fallback;
  return path;
}

export async function POST(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "invoices")) {
    return portalForbiddenResponse("Invoices are not available in the portal");
  }

  const body = (await request.json().catch(() => ({}))) as { returnPath?: string };
  const slug = resolvePortalSlug(ctx.company);
  if (!slug) {
    return NextResponse.json({ error: "Portal is not configured" }, { status: 400 });
  }

  const summary = await getPortalBillingSummary({
    companyId: ctx.companyId,
    customerId: ctx.customerId,
  });
  const invoices = summary.payableInvoices;
  if (invoices.length < 2) {
    return NextResponse.json(
      { error: "Pay all is available when two or more invoices are due" },
      { status: 400 }
    );
  }

  const returnPath = safeReturnPath(body.returnPath, slug);
  const appUrl = getAppBaseUrl(request.headers.get("origin"));
  const total = invoices.reduce((sum, invoice) => sum + invoice.balanceDue, 0);

  try {
    const session = await createCombinedInvoiceCheckoutSession({
      invoices,
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      customerEmail: ctx.customer.email,
      successUrl: `${appUrl}${returnPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}${returnPath}?payment=cancelled`,
    });
    return NextResponse.json({ url: session.url, sessionId: session.id, amount: total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
