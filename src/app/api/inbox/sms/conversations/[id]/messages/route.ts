import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { nextCustomerIdForSmsPhone } from "@/lib/inbox/conversations";
import { phonesMatch } from "@/lib/inbox/phone";
import { markInboundConversationRead } from "@/lib/inbox/badge-counts";
import { WEBSITE_FORM_SMS_BODY_STARTS_WITH } from "@/lib/inbox/website-leads";
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

    if (
      conversation.channel === "SMS" &&
      conversation.scope === "EXTERNAL" &&
      conversation.smsOpen === null
    ) {
      const promoted = await prisma.conversation.updateMany({
        where: {
          id,
          companyId: user.companyId,
          smsOpen: null,
          messages: {
            some: {
              direction: "INBOUND",
              readAt: null,
              NOT: { body: { startsWith: WEBSITE_FORM_SMS_BODY_STARTS_WITH } },
            },
          },
        },
        data: { smsOpen: true },
      });
      if (promoted.count) conversation = { ...conversation, smsOpen: true };
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
    const sids = messages.map((message) => message.twilioMessageSid).filter((sid): sid is string => Boolean(sid));
    const campaignSends = sids.length ? await prisma.campaignRecipient.findMany({
      where: { campaign: { companyId: user.companyId }, twilioMessageSid: { in: sids } },
      select: { twilioMessageSid: true, campaign: { select: { name: true } } },
    }) : [];
    const campaignBySid = new Map(campaignSends.map((send) => [send.twilioMessageSid, send.campaign.name]));

    return NextResponse.json({
      conversation,
      messages: messages.map((msg) => ({
        ...msg,
        campaignName: msg.twilioMessageSid ? campaignBySid.get(msg.twilioMessageSid) ?? null : null,
        sentAt: msg.sentAt.toISOString(),
        readAt: msg.readAt?.toISOString() ?? null,
        contactInfoAppliedAt: msg.contactInfoAppliedAt?.toISOString() ?? null,
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}
