import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { runStormAiTool } from "@/lib/storm-ai/execute";
import {
  buildPartsChatCard,
  formatPartsCardMarkdown,
} from "@/lib/storm-ai/parts-card";
import { canUseStormAiTool } from "@/lib/storm-ai/permissions";
import { sanitizeToolPayload } from "@/lib/storm-ai/prompt";
import { finalizeRealtimeToolPayload } from "@/lib/storm-ai/realtime-tool-payload";

export const maxDuration = 90;

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: string;
      callId?: string;
      name?: string;
      arguments?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";

    if (!name || !conversationId) {
      return NextResponse.json(
        { ok: false, error: "name and conversationId are required" },
        { status: 400 }
      );
    }

    if (!canUseStormAiTool(user.role, name)) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN", error: "Your role cannot use that tool." },
        { status: 403 }
      );
    }

    const conversation = await prisma.stormAiConversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
        companyId: user.companyId,
      },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", error: "Conversation not found" },
        { status: 404 }
      );
    }

    let args: Record<string, unknown> = {};
    if (body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)) {
      args = body.arguments as Record<string, unknown>;
    } else if (typeof body.arguments === "string") {
      try {
        args = JSON.parse(body.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
    }

    const result = await runStormAiTool(user, name, args, { conversationId });
    const chatCard = await buildPartsChatCard(user.companyId, name, result);
    const payload = finalizeRealtimeToolPayload(
      name,
      result,
      chatCard,
      sanitizeToolPayload,
      3500
    );

    // Persist without the live chatCard blob (stored as its own assistant message).
    const { chatCard: _omitCard, ...forDb } = payload;
    await prisma.stormAiMessage.create({
      data: {
        conversationId,
        userId: user.id,
        role: "tool",
        content: JSON.stringify(sanitizeToolPayload(forDb, 3500)),
        toolName: name,
        toolCallId: callId || null,
      },
    });

    if (chatCard) {
      await prisma.stormAiMessage.create({
        data: {
          conversationId,
          userId: user.id,
          role: "assistant",
          content: formatPartsCardMarkdown(chatCard),
          attachmentsJson: [chatCard] as never,
        },
      });
    }

    await prisma.stormAiAuditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        conversationId,
        question: `[realtime voice] ${name}`,
        toolsJson: [{ name, args: sanitizeToolPayload(args, 1500) }] as never,
        ok: Boolean((result as { ok?: boolean }).ok),
        model: process.env.STORM_AI_REALTIME_MODEL || process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
        responsePreview: JSON.stringify(forDb).slice(0, 500),
      },
    });

    return NextResponse.json(payload);
  } catch {
    return unauthorizedResponse();
  }
}
