import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { socialScopeToChannel } from "@/lib/meta/messaging";
import type { SocialScope } from "@/lib/inbox/types";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const platform = request.nextUrl.searchParams.get("platform") as SocialScope | null;

    if (!platform || (platform !== "facebook" && platform !== "instagram")) {
      return NextResponse.json({ error: "platform must be facebook or instagram" }, { status: 400 });
    }

    const channel = socialScopeToChannel(platform);

    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: user.companyId,
        channel,
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

    return NextResponse.json(conversations);
  } catch {
    return unauthorizedResponse();
  }
}
