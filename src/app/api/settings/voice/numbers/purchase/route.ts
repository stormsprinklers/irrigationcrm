import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { purchaseNumber } from "@/lib/twilio/numbers";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    if (!body.e164) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    const number = await purchaseNumber(user.companyId, String(body.e164), {
      friendlyName: body.friendlyName,
      numberType: body.numberType,
      callFlowId: body.callFlowId,
      assignedUserId: body.assignedUserId,
      trackingSource: body.trackingSource,
    });

    return NextResponse.json(number, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
