import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: { sender: { select: { id: true, name: true, email: true } } },
      orderBy: { sentAt: "asc" },
    });

    return NextResponse.json({ conversation, messages });
  } catch {
    return unauthorizedResponse();
  }
}
