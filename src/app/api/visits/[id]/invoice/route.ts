import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { deliverInvoice } from "@/lib/invoices/deliver";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import {
  getVisitInvoiceAvailability,
  syncVisitInvoice,
} from "@/lib/invoices/sync-visit-invoice";
import type { EstimateInvoiceAmountSelection } from "@/lib/invoices/estimate-invoice-amount";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();
    const { id: visitId } = await params;
    const result = await getVisitInvoiceAvailability({ companyId: user.companyId, visitId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: visitId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      send?: boolean;
      channel?: unknown;
      amountType?: unknown;
      amountValue?: unknown;
    };

    if (body.channel !== undefined && body.channel !== "EMAIL" && body.channel !== "SMS") {
      return NextResponse.json({ error: "Choose email or SMS to send the invoice." }, { status: 400 });
    }
    let amountSelection: EstimateInvoiceAmountSelection | undefined;
    if (body.amountType !== undefined || body.amountValue !== undefined) {
      if (
        (body.amountType !== "PERCENT" && body.amountType !== "FIXED") ||
        typeof body.amountValue !== "number"
      ) {
        return NextResponse.json({ error: "Enter a valid invoice amount." }, { status: 400 });
      }
      amountSelection = { type: body.amountType, value: body.amountValue };
    }

    const synced = await syncVisitInvoice({ companyId: user.companyId, visitId, amountSelection });
    if (!synced.ok) {
      return NextResponse.json({ error: synced.error }, { status: synced.status });
    }

    if (body.send === true) {
      const delivery = await deliverInvoice({
        invoiceId: synced.invoiceId,
        companyId: user.companyId,
        kind: "send",
        channel: body.channel as "EMAIL" | "SMS" | undefined,
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

    return NextResponse.json({
      invoice: synced.invoice,
      payLink: synced.payLink,
      balanceDue: synced.balanceDue,
    });
  } catch {
    return unauthorizedResponse();
  }
}
