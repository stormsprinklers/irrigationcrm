import { NextRequest, NextResponse } from "next/server";
import { AppNotificationType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { listOperatedVoiceAccounts } from "@/lib/account/operated-accounts";
import { resolveBrandPalette } from "@/lib/brand-palette";
import { prisma } from "@/lib/prisma";

const BELL_EXCLUDED_TYPES: AppNotificationType[] = [AppNotificationType.INBOX_SMS];

async function operatedAccountsFor(user: { id: string; email: string; companyId: string }) {
  const accounts = await listOperatedVoiceAccounts({
    userId: user.id,
    email: user.email,
    companyId: user.companyId,
  });
  const userIds = [...new Set(accounts.map((account) => account.userId))];
  if (!userIds.includes(user.id)) userIds.push(user.id);
  return { accounts, userIds };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20)));
    const since = request.nextUrl.searchParams.get("since");
    const { accounts, userIds } = await operatedAccountsFor(user);

    const where = {
      userId: { in: userIds },
      type: { notIn: BELL_EXCLUDED_TYPES },
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
    };

    const [notifications, unreadCount] = await Promise.all([
      prisma.appNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              brandPrimaryColor: true,
              brandSecondaryColor: true,
              brandPalette: true,
            },
          },
        },
      }),
      prisma.appNotification.count({
        where: { userId: { in: userIds }, isRead: false, type: { notIn: BELL_EXCLUDED_TYPES } },
      }),
    ]);

    const accountByCompanyId = new Map(accounts.map((account) => [account.companyId, account]));
    const accountByUserId = new Map(accounts.map((account) => [account.userId, account]));

    return NextResponse.json({
      currentCompanyId: user.companyId,
      notifications: notifications.map((item) => {
        const account =
          accountByCompanyId.get(item.companyId) ?? accountByUserId.get(item.userId);
        const palette = resolveBrandPalette(item.company);
        return {
          id: item.id,
          type: item.type,
          title: item.title,
          body: item.body,
          href: item.href,
          isRead: item.isRead,
          createdAt: item.createdAt,
          companyId: item.companyId,
          companyName: account?.companyName ?? item.company.name,
          brandPrimary: account?.brandPrimary ?? palette.primary,
          switchUserId: account?.userId ?? item.userId,
        };
      }),
      unreadCount,
    });
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
    const { userIds } = await operatedAccountsFor(user);
    const body = await request.json().catch(() => ({}));

    if (body.all === true) {
      await prisma.appNotification.updateMany({
        where: { userId: { in: userIds }, isRead: false },
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
      where: { userId: { in: userIds }, id: { in: ids } },
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
