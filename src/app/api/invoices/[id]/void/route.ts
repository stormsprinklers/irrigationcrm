import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { voidInvoice } from "@/lib/invoices/actions";
import { canAccessInvoices } from "@/lib/invoices/permissions";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessInvoices(user.role)) return forbiddenResponse();

    const { id } = await params;
    const result = await voidInvoice(user.companyId, id);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
