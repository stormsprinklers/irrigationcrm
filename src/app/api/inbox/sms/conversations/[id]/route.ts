import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  canAccessFieldSmsConversation,
  FIELD_CUSTOMER_COMMS_FORBIDDEN,
} from "@/lib/field/access";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (typeof body.open !== "boolean") {
      return badRequestResponse("open must be true or false");
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        companyId: user.companyId,
        channel: "SMS",
        scope: "EXTERNAL",
      },
      select: { id: true, scope: true, customerId: true, lastMessageAt: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (!(await canAccessFieldSmsConversation(user, conversation))) {
      return forbiddenResponse(FIELD_CUSTOMER_COMMS_FORBIDDEN);
    }
    if (body.open === false && typeof body.lastMessageAt === "string") {
      const viewedLastMessageAt = new Date(body.lastMessageAt);
      if (
        Number.isNaN(viewedLastMessageAt.getTime()) ||
        viewedLastMessageAt.getTime() !== conversation.lastMessageAt.getTime()
      ) {
        return NextResponse.json(
          { error: "A new message arrived. Review it before closing this conversation." },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { smsOpen: body.open },
      select: { id: true, smsOpen: true },
    });
    return NextResponse.json({ conversation: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Could not update conversation" }, { status: 500 });
  }
}
