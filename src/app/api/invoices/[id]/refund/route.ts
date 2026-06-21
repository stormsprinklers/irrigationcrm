import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canIssueRefunds } from "@/lib/invoices/permissions";
import { RefundError, issueInvoiceRefund } from "@/lib/invoices/refund";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canIssueRefunds(user.role)) {
      return forbiddenResponse();
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const result = await issueInvoiceRefund(user.companyId, id, {
      paymentId: body.paymentId as string | undefined,
      amount: body.amount != null ? Number(body.amount) : undefined,
      reason: body.reason as string | undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RefundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
