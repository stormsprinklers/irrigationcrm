import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { deliverInvoice } from "@/lib/invoices/deliver";
import { syncVisitInvoice } from "@/lib/invoices/sync-visit-invoice";
import { createStripeCheckoutPayUrl } from "@/lib/stripe/invoice-checkout";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: visitId } = await params;
    const body = (await request.json().catch(() => ({}))) as { send?: boolean };

    const synced = await syncVisitInvoice({ companyId: user.companyId, visitId });
    if (!synced.ok) {
      return NextResponse.json({ error: synced.error }, { status: synced.status });
    }

    if (body.send === true) {
      const delivery = await deliverInvoice({
        invoiceId: synced.invoiceId,
        companyId: user.companyId,
        kind: "send",
      });
      if ("error" in delivery && !delivery.invoice) {
        return NextResponse.json(
          {
            error: delivery.error,
            payUrl: delivery.payUrl,
            payLink: delivery.payUrl,
            invoice: synced.invoice,
            balanceDue: synced.balanceDue,
          },
          { status: delivery.status }
        );
      }
      return NextResponse.json({
        invoice: delivery.invoice ?? synced.invoice,
        payLink: delivery.payUrl ?? synced.payLink,
        balanceDue: synced.balanceDue,
        emailSent: delivery.emailSent,
        smsSent: delivery.smsSent,
      });
    }

    // Prepare / QR: return a live Stripe Checkout session.url when possible.
    let payLink = synced.payLink;
    try {
      const checkout = await createStripeCheckoutPayUrl({
        invoiceId: synced.invoiceId,
        companyId: user.companyId,
      });
      if (checkout?.url) payLink = checkout.url;
    } catch (err) {
      console.error("createStripeCheckoutPayUrl failed:", err);
    }

    return NextResponse.json({
      invoice: synced.invoice,
      payLink,
      balanceDue: synced.balanceDue,
    });
  } catch {
    return unauthorizedResponse();
  }
}
