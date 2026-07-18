import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { deliverInvoice } from "@/lib/invoices/deliver";
import { canAccessInvoices } from "@/lib/invoices/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const result = await deliverInvoice({ invoiceId: id, companyId: user.companyId, kind: "send" });
    if ("error" in result && !result.invoice) {
      return NextResponse.json(
        { error: result.error, payUrl: result.payUrl },
        { status: result.status }
      );
    }
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
