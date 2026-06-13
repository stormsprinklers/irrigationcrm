import { NextRequest, NextResponse } from "next/server";
import { getPublicInvoiceByToken } from "@/lib/invoices/queries";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const invoice = await getPublicInvoiceByToken(token);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(invoice);
}
