import { NextRequest, NextResponse } from "next/server";
import { Scope, Channel } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse, badRequestResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const scopeParam = request.nextUrl.searchParams.get("scope") ?? "internal";

    if (scopeParam === "team") {
      const users = await prisma.user.findMany({
        where: { companyId: user.companyId, NOT: { id: user.id }, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          color: true,
          photoUrl: true,
          title: true,
        },
        orderBy: { name: "asc" },
      });
      return NextResponse.json(users);
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: user.companyId,
        channel: Channel.INTERNAL_CHAT,
        scope: Scope.INTERNAL,
      },
      include: {
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    return NextResponse.json(conversations);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { conversationId, body: messageBody, title, recipientIds } = body;

    if (!messageBody?.trim()) return badRequestResponse("Message body required");

    let conversation;

    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, companyId: user.companyId },
      });
      if (!conversation) return badRequestResponse("Conversation not found");
    } else {
      conversation = await findOrCreateSmsConversation({
        companyId: user.companyId,
        scope: Scope.INTERNAL,
        title: title ?? `Chat with ${recipientIds?.length ?? 1} member(s)`,
      });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        direction: "OUTBOUND",
        body: messageBody,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return NextResponse.json({ conversation, message });
  } catch {
    return unauthorizedResponse();
  }
}
