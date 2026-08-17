import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { serializeAttachments } from "@/lib/storm-ai/attachments";
import { parsePartsCardFromAttachments } from "@/lib/storm-ai/parts-card";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const conversation = await prisma.stormAiConversation.findFirst({
      where: { id, userId: user.id, companyId: user.companyId },
      include: {
        messages: {
          where: { role: { in: ["user", "assistant"] } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          attachments: serializeAttachments(m.attachmentsJson),
          partsCard: parsePartsCardFromAttachments(m.attachmentsJson),
        })),
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}
