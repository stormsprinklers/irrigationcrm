import { NextRequest, NextResponse } from "next/server";
import { getPublicInvoiceByToken } from "@/lib/invoices/queries";
import { confirmCheckoutSession } from "@/lib/stripe/confirm-checkout";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const invoice = await getPublicInvoiceByToken(token);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const sessionId =
    (body.sessionId as string | undefined) ??
    request.nextUrl.searchParams.get("session_id") ??
    undefined;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const result = await confirmCheckoutSession(sessionId);
    if (!result.confirmed) {
      return NextResponse.json(result, { status: 202 });
    }

    const updated = await getPublicInvoiceByToken(token);
    return NextResponse.json({ ...result, invoice: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirmation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
