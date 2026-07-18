import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { deleteInvoice } from "@/lib/invoices/actions";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { getInvoiceForCompany } from "@/lib/invoices/queries";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const invoice = await getInvoiceForCompany(user.companyId, id);
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const voidFirst = Boolean(body?.voidFirst);

    const result = await deleteInvoice(user.companyId, id, { voidFirst });
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}

