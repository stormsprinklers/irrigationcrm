import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { syncVisitInvoice } from "@/lib/invoices/sync-visit-invoice";
import { createInvoiceCheckoutSession } from "@/lib/stripe/invoice-checkout";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const visitId = body.visitId as string | undefined;
    if (!visitId) return badRequestResponse("visitId is required");

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 503 });
    }

    const synced = await syncVisitInvoice({ companyId: user.companyId, visitId });
    if (!synced.ok) {
      return NextResponse.json({ error: synced.error }, { status: synced.status });
    }

    const visit = await prisma.visit.findFirst({
      where: { id: visitId, companyId: user.companyId },
      include: { customer: true },
    });
    if (!visit?.customer) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    const mobileReturn = body.mobileReturn === true || body.platform === "ios";
    const successUrl = mobileReturn
      ? `stormcrm://payment-return?visitId=${visit.id}&session_id={CHECKOUT_SESSION_ID}`
      : `${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/visits/${visit.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = mobileReturn
      ? `stormcrm://payment-return?visitId=${visit.id}&payment=cancelled`
      : `${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/visits/${visit.id}?payment=cancelled`;

    const session = await createInvoiceCheckoutSession({
      invoice: {
        id: synced.invoiceId,
        invoiceNumber: synced.invoice.invoiceNumber,
        companyId: user.companyId,
        visitId: visit.id,
      },
      customerEmail: visit.customer.email,
      productName: visit.title,
      amount: synced.balanceDue,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({
      url: session.url,
      payLink: synced.payLink,
      balanceDue: synced.balanceDue,
      invoice: synced.invoice,
    });
  } catch {
    return unauthorizedResponse();
  }
}
