import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getInvoiceForCompany } from "@/lib/invoices/queries";
import { confirmCheckoutSession } from "@/lib/stripe/confirm-checkout";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json().catch(() => ({}));
    const sessionId = body.sessionId as string | undefined;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const result = await confirmCheckoutSession(sessionId);
    if (!result.confirmed) {
      return NextResponse.json(result, { status: 202 });
    }

    const invoice = await getInvoiceForCompany(user.companyId, result.invoiceId);
    return NextResponse.json({ ...result, invoice });
  } catch {
    return unauthorizedResponse();
  }
}
