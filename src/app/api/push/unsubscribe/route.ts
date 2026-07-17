import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { deleteWebPushSubscription } from "@/lib/web-push/subscriptions";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = (await request.json()) as { endpoint?: string };
    const endpoint = String(body.endpoint ?? "").trim();
    if (!endpoint) {
      return badRequestResponse("endpoint is required");
    }

    await deleteWebPushSubscription({
      userId: user.id,
      endpoint,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Web push unsubscribe failed", error);
    return NextResponse.json({ error: "Unsubscribe failed" }, { status: 500 });
  }
}
