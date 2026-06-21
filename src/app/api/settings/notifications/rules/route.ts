import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { ensureDefaultNotificationTemplates } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    await ensureDefaultNotificationTemplates(user.companyId);

    const rules = await prisma.notificationRule.findMany({
      where: { companyId: user.companyId },
      include: { template: true },
      orderBy: { event: "asc" },
    });

    return NextResponse.json({ rules });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const body = await request.json();
    const { id, enabled } = body;
    if (!id || enabled === undefined) {
      return NextResponse.json({ error: "id and enabled are required" }, { status: 400 });
    }

    const existing = await prisma.notificationRule.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rule = await prisma.notificationRule.update({
      where: { id },
      data: { enabled: Boolean(enabled) },
      include: { template: true },
    });

    return NextResponse.json(rule);
  } catch {
    return unauthorizedResponse();
  }
}
