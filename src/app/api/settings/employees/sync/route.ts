import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import {
  assertOperatedSourceCompany,
  listEmployeeSyncSourceCompanies,
  listSourceEmployeesForSync,
  syncEmployeesFromCompany,
} from "@/lib/employees/sync-from-company";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const sourceCompanyId = request.nextUrl.searchParams.get("sourceCompanyId");
    const catalogs = await listEmployeeSyncSourceCompanies({
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
    });

    if (!sourceCompanyId) {
      return NextResponse.json(catalogs);
    }

    try {
      await assertOperatedSourceCompany(
        { userId: user.id, email: user.email, companyId: user.companyId },
        sourceCompanyId
      );
    } catch (err) {
      return badRequestResponse(err instanceof Error ? err.message : "Invalid source company");
    }

    const employees = await listSourceEmployeesForSync(sourceCompanyId, user.companyId);
    return NextResponse.json({ ...catalogs, employees });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const body = await request.json();
    const sourceCompanyId = String(body.sourceCompanyId ?? "");
    const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.map(String) : [];

    if (!employeeIds.length) {
      return badRequestResponse("Select at least one employee");
    }

    try {
      await assertOperatedSourceCompany(
        { userId: user.id, email: user.email, companyId: user.companyId },
        sourceCompanyId
      );
    } catch (err) {
      return badRequestResponse(err instanceof Error ? err.message : "Invalid source company");
    }

    const result = await syncEmployeesFromCompany({
      sourceCompanyId,
      targetCompanyId: user.companyId,
      employeeIds,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to copy employees" }, { status: 500 });
  }
}
