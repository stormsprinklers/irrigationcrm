import { NextRequest, NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listVisitsForCompany } from "@/lib/visits/queries";
import { isFieldRole } from "@/lib/employees";
import { fieldVisitAssigneeWhere } from "@/lib/field/access";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? undefined;
    const statusParam = searchParams.get("status");
    const status =
      statusParam && Object.values(VisitStatus).includes(statusParam as VisitStatus)
        ? (statusParam as VisitStatus)
        : undefined;

    const visits = await listVisitsForCompany(user.companyId, {
      search,
      status,
      extraWhere: isFieldRole(user.role)
        ? await fieldVisitAssigneeWhere(user.companyId, user.id)
        : undefined,
    });
    return NextResponse.json({ visits });
  } catch {
    return unauthorizedResponse();
  }
}
