import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { nextCustomerIdForSmsPhone } from "@/lib/inbox/conversations";
import { phonesMatch } from "@/lib/inbox/phone";
import { markInboundConversationRead } from "@/lib/inbox/badge-counts";
import {
  canAccessFieldSmsConversation,
  FIELD_CUSTOMER_COMMS_FORBIDDEN,
} from "@/lib/field/access";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    let conversation = await prisma.conversation.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            doNotService: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const customerPhoneMismatch =
      Boolean(conversation.customer?.phone) &&
      Boolean(conversation.participantPhone) &&
      !phonesMatch(conversation.customer?.phone, conversation.participantPhone);

    if (
      conversation.participantPhone &&
      (!conversation.customerId || customerPhoneMismatch)
    ) {
      const nextId = await nextCustomerIdForSmsPhone({
        companyId: user.companyId,
        participantPhone: conversation.participantPhone,
        currentCustomerId: conversation.customerId,
      });
      if (nextId !== (conversation.customerId ?? null)) {
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: { customerId: nextId },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                doNotService: true,
              },
            },
          },
        });
      }
    }

    if (!(await canAccessFieldSmsConversation(user, conversation))) {
      return forbiddenResponse(FIELD_CUSTOMER_COMMS_FORBIDDEN);
    }

    await markInboundConversationRead(user.companyId, id);

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        media: true,
      },
      orderBy: { sentAt: "asc" },
    });

    return NextResponse.json({
      conversation,
      messages: messages.map((msg) => ({
        ...msg,
        sentAt: msg.sentAt.toISOString(),
        readAt: msg.readAt?.toISOString() ?? null,
        contactInfoAppliedAt: msg.contactInfoAppliedAt?.toISOString() ?? null,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}
