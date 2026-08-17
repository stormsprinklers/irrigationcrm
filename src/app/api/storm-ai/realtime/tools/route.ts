import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { runStormAiTool } from "@/lib/storm-ai/execute";
import { canUseStormAiTool } from "@/lib/storm-ai/permissions";
import { sanitizeToolPayload } from "@/lib/storm-ai/prompt";

export const maxDuration = 60;

/** Keep realtime tool payloads small so the model can speak again quickly. */
function slimRealtimeToolResult(name: string, result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const root = result as Record<string, unknown>;

  if (name === "search_parts_info" && Array.isArray(root.parts)) {
    return {
      ...root,
      parts: root.parts.map((row) => {
        if (!row || typeof row !== "object") return row;
        const part = row as Record<string, unknown>;
        const { photos: _photos, ...rest } = part;
        return {
          ...rest,
          photoCount: Array.isArray(part.photos) ? part.photos.length : part.photoCount ?? 0,
        };
      }),
    };
  }

  if (name === "get_parts_info" && root.part && typeof root.part === "object") {
    const part = root.part as Record<string, unknown>;
    const photos = Array.isArray(part.photos) ? part.photos : [];
    return {
      ...root,
      part: {
        ...part,
        photos: photos.slice(0, 2).map((p) => {
          if (!p || typeof p !== "object") return p;
          const photo = p as Record<string, unknown>;
          return { id: photo.id, url: photo.url, fileName: photo.fileName };
        }),
      },
    };
  }

  return result;
}

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
    const slimmed = slimRealtimeToolResult(name, result);
    const payload = sanitizeToolPayload(slimmed, 3500);

    await prisma.stormAiMessage.create({
      data: {
        conversationId,
        userId: user.id,
        role: "tool",
        content: JSON.stringify(payload),
        toolName: name,
        toolCallId: callId || null,
      },
    });

    await prisma.stormAiAuditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        conversationId,
        question: `[realtime voice] ${name}`,
        toolsJson: [{ name, args: sanitizeToolPayload(args, 1500) }] as never,
        ok: Boolean((result as { ok?: boolean }).ok),
        model: process.env.STORM_AI_REALTIME_MODEL || process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
        responsePreview: JSON.stringify(payload).slice(0, 500),
      },
    });

    return NextResponse.json(payload);
  } catch {
    return unauthorizedResponse();
  }
}
