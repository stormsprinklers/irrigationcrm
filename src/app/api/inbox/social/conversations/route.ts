import { NextRequest, NextResponse } from "next/server";
import { Channel } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { channelToSocialPlatform, socialScopeToChannel } from "@/lib/meta/messaging";
import type { SocialScope } from "@/lib/inbox/types";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const platformParam = request.nextUrl.searchParams.get("platform");

    let channels: Channel[];
    if (!platformParam || platformParam === "all") {
      channels = [Channel.FACEBOOK, Channel.INSTAGRAM];
    } else if (platformParam === "facebook" || platformParam === "instagram") {
      channels = [socialScopeToChannel(platformParam as SocialScope)];
    } else {
      return NextResponse.json(
        { error: "platform must be facebook, instagram, or all" },
        { status: 400 }
      );
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: user.companyId,
        channel: { in: channels },
      },
      include: {
        customer: {
          select: { id: true, name: true, doNotService: true },
        },
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    return NextResponse.json(
      conversations.map((conversation) => ({
        ...conversation,
        platform: channelToSocialPlatform(conversation.channel),
      }))
    );
  } catch {
    return unauthorizedResponse();
  }
}
