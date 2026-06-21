import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  bulkArchiveCustomers,
  bulkDeleteCustomers,
  bulkMergeCustomers,
  bulkSetDoNotService,
} from "@/lib/customers/bulk";
import { canFlagDoNotService, canManageCustomers } from "@/lib/customers/permissions";

type BulkAction =
  | "delete"
  | "archive"
  | "restore"
  | "merge"
  | "setDoNotService"
  | "clearDoNotService";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const action = body.action as BulkAction | undefined;
    const customerIds = Array.isArray(body.customerIds)
      ? body.customerIds.filter((id: unknown): id is string => typeof id === "string")
      : [];

    if (!action) return badRequestResponse("action is required");
    if (customerIds.length === 0) return badRequestResponse("customerIds is required");

    if (action === "setDoNotService" || action === "clearDoNotService") {
      if (!canFlagDoNotService(user.role)) return forbiddenResponse();
      await bulkSetDoNotService(
        user.companyId,
        customerIds,
        action === "setDoNotService"
      );
      return NextResponse.json({ ok: true, count: customerIds.length });
    }

    if (!canManageCustomers(user.role)) return forbiddenResponse();

    if (action === "delete") {
      await bulkDeleteCustomers(user.companyId, customerIds);
      return NextResponse.json({ ok: true, count: customerIds.length });
    }

    if (action === "archive") {
      await bulkArchiveCustomers(user.companyId, customerIds, true);
      return NextResponse.json({ ok: true, count: customerIds.length });
    }

    if (action === "restore") {
      await bulkArchiveCustomers(user.companyId, customerIds, false);
      return NextResponse.json({ ok: true, count: customerIds.length });
    }

    if (action === "merge") {
      const targetCustomerId = body.targetCustomerId as string | undefined;
      if (!targetCustomerId) return badRequestResponse("targetCustomerId is required");
      if (!customerIds.includes(targetCustomerId)) {
        return badRequestResponse("Target customer must be included in the selection");
      }
      const sources = customerIds.filter((id: string) => id !== targetCustomerId);
      if (sources.length === 0) {
        return badRequestResponse("Select at least two customers to merge");
      }
      await bulkMergeCustomers(user.companyId, targetCustomerId, sources);
      return NextResponse.json({ ok: true, mergedIntoId: targetCustomerId, count: sources.length });
    }

    return badRequestResponse("Unknown action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
