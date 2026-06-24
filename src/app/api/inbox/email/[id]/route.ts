import { NextRequest, NextResponse } from "next/server";
import { EmailFolder } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse, badRequestResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const email = await prisma.emailMessage.findFirst({
      where: { id, companyId: user.companyId },
      include: { customer: true, attachments: true },
    });

    if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!email.isRead) {
      await prisma.emailMessage.update({
        where: { id },
        data: { isRead: true },
      });
    }

    return NextResponse.json(email);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();
    const { folder, isRead } = body;

    const email = await prisma.emailMessage.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const validFolders = Object.values(EmailFolder);
    if (folder && !validFolders.includes(folder)) {
      return badRequestResponse("Invalid folder");
    }

    const updated = await prisma.emailMessage.update({
      where: { id },
      data: {
        ...(folder ? { folder } : {}),
        ...(typeof isRead === "boolean" ? { isRead } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const email = await prisma.emailMessage.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (email.folder === EmailFolder.TRASH) {
      await prisma.emailMessage.delete({ where: { id } });
    } else {
      await prisma.emailMessage.update({
        where: { id },
        data: { folder: EmailFolder.TRASH },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return unauthorizedResponse();
  }
}
