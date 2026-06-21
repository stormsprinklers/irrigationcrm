import { NextRequest, NextResponse } from "next/server";
import { Channel } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { ensureDefaultNotificationTemplates } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    await ensureDefaultNotificationTemplates(user.companyId);

    const templates = await prisma.notificationTemplate.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ slug: "asc" }, { channel: "asc" }],
    });

    return NextResponse.json({ templates });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const body = await request.json();
    const { channel, slug, name, subject, body: templateBody } = body;

    if (!channel || !slug || !name || !templateBody) {
      return badRequestResponse("channel, slug, name, and body are required");
    }
    if (!Object.values(Channel).includes(channel)) {
      return badRequestResponse("Invalid channel");
    }

    const template = await prisma.notificationTemplate.create({
      data: {
        companyId: user.companyId,
        channel,
        slug: String(slug),
        name: String(name),
        subject: subject ?? null,
        body: String(templateBody),
      },
    });

    return NextResponse.json(template, { status: 201 });
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
    const { id, name, subject, body: templateBody } = body;
    if (!id) return badRequestResponse("id is required");

    const existing = await prisma.notificationTemplate.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(subject !== undefined ? { subject: subject ?? null } : {}),
        ...(templateBody !== undefined ? { body: String(templateBody) } : {}),
      },
    });

    return NextResponse.json(template);
  } catch {
    return unauthorizedResponse();
  }
}
