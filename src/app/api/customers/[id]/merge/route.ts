import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, badRequestResponse,
  forbiddenResponse,
  requireSessionUser, } from "@/lib/api-auth";
import { mergeCustomers } from "@/lib/customers/merge";
import { serializeCustomer } from "@/lib/customers/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id: sourceId } = await params;
    const body = await request.json();
    const targetId = body.targetCustomerId as string | undefined;
    if (!targetId) return badRequestResponse("targetCustomerId is required");

    const target = await mergeCustomers({
      companyId: user.companyId,
      sourceId,
      targetId,
    });

    if (!target) {
      return NextResponse.json({ error: "Merge failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      customer: serializeCustomer(target),
      mergedIntoId: targetId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Merge failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
