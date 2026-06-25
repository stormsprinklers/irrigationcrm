import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20)));
    const since = request.nextUrl.searchParams.get("since");

    const where = {
      userId: user.id,
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.appNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.appNotification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json().catch(() => ({}));

    if (body.all === true) {
      await prisma.appNotification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ ok: true });
    }

    const ids = Array.isArray(body.ids)
      ? (body.ids as unknown[]).filter((id): id is string => typeof id === "string")
      : [];

    if (!ids.length) {
      return NextResponse.json({ error: "No notification ids provided" }, { status: 400 });
    }

    await prisma.appNotification.updateMany({
      where: { userId: user.id, id: { in: ids } },
      data: { isRead: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
