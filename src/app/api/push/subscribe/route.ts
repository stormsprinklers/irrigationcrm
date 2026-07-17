import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { isWebPushConfigured } from "@/lib/web-push/config";
import { upsertWebPushSubscription } from "@/lib/web-push/subscriptions";

export async function POST(request: NextRequest) {
  try {
    if (!isWebPushConfigured()) {
      return NextResponse.json(
        { error: "Web push is not configured on the server" },
        { status: 503 }
      );
    }

    const user = await requireSessionUser(request);
    const body = (await request.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    const endpoint = String(body.endpoint ?? "").trim();
    const p256dh = String(body.keys?.p256dh ?? "").trim();
    const auth = String(body.keys?.auth ?? "").trim();

    if (!endpoint || !p256dh || !auth) {
      return badRequestResponse("endpoint and keys.p256dh / keys.auth are required");
    }

    await upsertWebPushSubscription({
      userId: user.id,
      companyId: user.companyId,
      endpoint,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Web push subscribe failed", error);
    return NextResponse.json({ error: "Subscription failed" }, { status: 500 });
  }
}
