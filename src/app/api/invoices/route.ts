import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getInvoiceForCompany, listInvoices } from "@/lib/invoices/queries";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;

    const invoices = await listInvoices(user.companyId, {
      customerId: searchParams.get("customerId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    return NextResponse.json({ invoices, total: invoices.length });
  } catch {
    return unauthorizedResponse();
  }
}
