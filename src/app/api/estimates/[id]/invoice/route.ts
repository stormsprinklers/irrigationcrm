import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { deliverInvoice } from "@/lib/invoices/deliver";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { syncEstimateInvoice } from "@/lib/invoices/sync-estimate-invoice";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const synced = await syncEstimateInvoice({
      companyId: user.companyId,
      estimateId: id,
    });
    if (!synced.ok) {
      return NextResponse.json({ error: synced.error }, { status: synced.status });
    }

    const delivered = await deliverInvoice({
      invoiceId: synced.invoice.id,
      companyId: user.companyId,
      kind: "send",
    });
    if ("error" in delivered && !delivered.invoice) {
      return NextResponse.json(
        { error: delivered.error, payUrl: delivered.payUrl, invoice: synced.invoice },
        { status: delivered.status }
      );
    }
    return NextResponse.json(delivered);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Estimate invoice send failed", error);
    return NextResponse.json({ error: "Invoice could not be sent" }, { status: 500 });
  }
}
