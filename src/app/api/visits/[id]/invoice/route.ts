import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { deliverInvoice } from "@/lib/invoices/deliver";
import { syncVisitInvoice } from "@/lib/invoices/sync-visit-invoice";

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

    return NextResponse.json({
      invoice: synced.invoice,
      payLink: synced.payLink,
      balanceDue: synced.balanceDue,
    });
  } catch {
    return unauthorizedResponse();
  }
}
