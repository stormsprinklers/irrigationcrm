import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { deliverInvoice } from "@/lib/invoices/deliver";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const result = await deliverInvoice({ invoiceId: id, companyId: user.companyId, kind: "remind" });
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
