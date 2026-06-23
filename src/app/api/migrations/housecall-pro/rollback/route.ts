import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/api-auth";
import { rollbackHousecallProMigration } from "@/lib/housecall-pro/rollback";
import { requireAdmin } from "@/lib/housecall-pro/orchestrator";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    requireAdmin(user.role);

    const body = await request.json().catch(() => ({}));
    const confirm = String((body as { confirm?: string }).confirm ?? "");
    if (confirm !== "ROLLBACK") {
      return NextResponse.json(
        { error: 'Type "ROLLBACK" in the confirm field to proceed' },
        { status: 400 }
      );
    }

    const migrationId =
      typeof (body as { migrationId?: string }).migrationId === "string"
        ? (body as { migrationId: string }).migrationId
        : undefined;

    const summary = await rollbackHousecallProMigration(user.companyId, migrationId);
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof Error && err.message === "Admin access required") {
      return forbiddenResponse();
    }
    if (err instanceof Error && err.message.includes("No migration")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return unauthorizedResponse();
  }
}
