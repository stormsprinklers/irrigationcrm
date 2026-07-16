import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { syncAllEmployeesToLms } from "@/lib/integrations/lms-sync";

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const result = await syncAllEmployeesToLms(user.companyId, { includeArchived: true });
    if ("error" in result && result.synced === 0 && result.failed === 0 && result.error) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }

    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
