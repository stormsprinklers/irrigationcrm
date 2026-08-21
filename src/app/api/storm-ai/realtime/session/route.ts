import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canUseTechAssist } from "@/lib/storm-ai/permissions";
import { mintStormAiRealtimeClientSecret } from "@/lib/storm-ai/realtime";
import { getActiveTechAssistSession } from "@/lib/storm-ai/tech-assist";
import type { StormAiPageContext } from "@/lib/storm-ai/types";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: string;
      pageContext?: StormAiPageContext;
      voice?: string;
      videoMode?: boolean;
    };

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { timezone: true },
    });
    const timezone = company?.timezone || "America/Denver";

    let conversationId =
      typeof body.conversationId === "string" ? body.conversationId.trim() : "";

    if (conversationId) {
      const existing = await prisma.stormAiConversation.findFirst({
        where: {
          id: conversationId,
          userId: user.id,
          companyId: user.companyId,
        },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
    } else {
      const created = await prisma.stormAiConversation.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          title: body.videoMode ? "Video session" : "Voice session",
        },
        select: { id: true },
      });
      conversationId = created.id;
    }

    const minted = await mintStormAiRealtimeClientSecret({
      user,
      timezone,
      pageContext: body.pageContext ?? null,
      voice: typeof body.voice === "string" ? body.voice : undefined,
      videoMode: Boolean(body.videoMode),
      conversationId,
    });

    if ("error" in minted) {
      return NextResponse.json(
        { error: minted.error, detail: minted.detail },
        { status: minted.status }
      );
    }

    let activeTechAssist: Awaited<ReturnType<typeof getActiveTechAssistSession>> | null =
      null;
    if (canUseTechAssist(user.role)) {
      try {
        activeTechAssist = await getActiveTechAssistSession({
          companyId: user.companyId,
          userId: user.id,
          conversationId,
        });
      } catch {
        activeTechAssist = null;
      }
    }

    return NextResponse.json({
      conversationId,
      clientSecret: minted.clientSecret,
      expiresAt: minted.expiresAt,
      model: minted.model,
      voice: minted.voice,
      /** Tools are already bound on the ephemeral session; returned for client UI only. */
      toolNames: minted.tools.map((t) => t.name),
      /** So the client can seed the live model after reconnect without guessing. */
      activeTechAssist:
        activeTechAssist && activeTechAssist.ok && activeTechAssist.active
          ? activeTechAssist
          : null,
    });
  } catch {
    return unauthorizedResponse();
  }
}
