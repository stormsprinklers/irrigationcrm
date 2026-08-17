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

export const maxDuration = 60;

/** Keep realtime tool payloads small so the model can speak again quickly. */
function slimRealtimeToolResult(name: string, result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const root = result as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  if (name === "search_parts_info" && Array.isArray(data.parts)) {
    const slimParts = data.parts.slice(0, 5).map((row) => {
      if (!row || typeof row !== "object") return row;
      const part = row as Record<string, unknown>;
      return {
        id: part.id,
        name: part.name,
        manufacturer: part.manufacturer,
        partNumber: part.partNumber,
        section: part.section,
        visualDescription:
          typeof part.visualDescription === "string"
            ? part.visualDescription.slice(0, 220)
            : part.visualDescription,
        technicalDescription:
          typeof part.technicalDescription === "string"
            ? part.technicalDescription.slice(0, 220)
            : part.technicalDescription,
        hasManual: part.hasManual,
        manualUrl: part.manualUrl ?? null,
        manualKind: part.manualKind ?? null,
        photoCount: Array.isArray(part.photos) ? part.photos.length : part.photoCount ?? 0,
      };
    });
    if (root.data && typeof root.data === "object") {
      return {
        ...root,
        data: {
          ...data,
          parts: slimParts,
          note:
            "Speak the best match now. Photos, specs, and the manual (if any) are already shown in the chat panel — tell the tech to look there. Do not invent a link.",
        },
      };
    }
    return { ...data, parts: slimParts };
  }

  if (name === "get_parts_info") {
    const part = data.part;
    if (part && typeof part === "object") {
      const p = part as Record<string, unknown>;
      const slimPart = {
        id: p.id,
        name: p.name,
        manufacturer: p.manufacturer,
        partNumber: p.partNumber,
        sectionName: p.sectionName,
        visualDescription: p.visualDescription,
        technicalDescription: p.technicalDescription,
        manualUrl: p.manualUrl,
        manualKind: p.manualKind,
        manualFileName: p.manualFileName,
      };
      if (root.data && typeof root.data === "object") {
        return {
          ...root,
          data: {
            ...data,
            part: slimPart,
            note:
              "Speak these details now. Photos and the manual link are already shown in the chat panel — tell the tech to open them there. Do not invent a link.",
          },
        };
      }
      return { ...data, part: slimPart };
    }
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
    const chatCard = await buildPartsChatCard(user.companyId, name, result);
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
        responsePreview: JSON.stringify(payload).slice(0, 500),
      },
    });

    return NextResponse.json({
      ...(typeof payload === "object" && payload ? payload : { result: payload }),
      chatCard: chatCard ?? undefined,
    });
  } catch {
    return unauthorizedResponse();
  }
}
