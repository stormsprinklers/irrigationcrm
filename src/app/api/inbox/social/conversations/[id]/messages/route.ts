import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { channelToSocialPlatform, sendSocialDm } from "@/lib/meta/messaging";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        customer: {
          select: { id: true, name: true, doNotService: true },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const platform = channelToSocialPlatform(conversation.channel);
    if (!platform) {
      return NextResponse.json({ error: "Not a social conversation" }, { status: 400 });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: {
        sender: { select: { id: true, name: true } },
        media: true,
      },
      orderBy: { sentAt: "asc" },
    });

    return NextResponse.json({ conversation, messages, platform });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json();
    const text = typeof body.body === "string" ? body.body : "";

    const conversation = await prisma.conversation.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const platform = channelToSocialPlatform(conversation.channel);
    if (!platform || !conversation.participantMetaId) {
      return NextResponse.json({ error: "Invalid social conversation" }, { status: 400 });
    }

    if (!text.trim()) return badRequestResponse("Message body required");

    const result = await sendSocialDm({
      companyId: user.companyId,
      platform,
      participantMetaId: conversation.participantMetaId,
      body: text,
      senderUserId: user.id,
      conversationId: conversation.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
