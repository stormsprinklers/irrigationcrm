import { NextRequest, NextResponse } from "next/server";
import { Scope, Channel, MessageDirection, Prisma } from "@prisma/client";
import {
  requireSessionUser,
  unauthorizedResponse,
  badRequestResponse,
  forbiddenResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { phoneDigitsKey, phonesMatch } from "@/lib/inbox/phone";
import { sendSms } from "@/lib/inbox/twilio";
import { prefixOutboundSmsWithCompanyName } from "@/lib/inbox/sms-company-prefix";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import { findOrCreateSmsConversation, nextCustomerIdForSmsPhone } from "@/lib/inbox/conversations";
import { resolveCustomerIdForSmsPhone } from "@/lib/inbox/customer-lookup";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import type { PendingAttachment } from "@/lib/inbox/attachments";
import { isBlobStorageUrl } from "@/lib/blob/urls";
import { pathnameFromBlobUrl, twilioAccessibleMediaUrl } from "@/lib/inbox/media-url";
import { WEBSITE_FORM_SMS_BODY_STARTS_WITH } from "@/lib/inbox/website-leads";
import { markInboundConversationRead } from "@/lib/inbox/badge-counts";
import { getCompanyCallerId } from "@/lib/voice/company-phone";

type SendSmsBody = {
  to?: string;
  conversationId?: string;
  body?: string;
  customerId?: string;
  scope?: string;
  title?: string;
  userId?: string;
  media?: PendingAttachment[];
};

async function sendSmsMessage(params: {
  user: { id: string; companyId: string };
  scope: Scope;
  to: string;
  messageBody: string;
  media: PendingAttachment[];
  statusCallback: string;
  customerId?: string;
  title?: string;
  userId?: string;
}) {
  const company = await prisma.company.findUnique({ where: { id: params.user.companyId } });
  if (!company) throw new Error("Company not found");
  const fromNumber = (await getCompanyCallerId(params.user.companyId)) ?? company.twilioPhone;
  if (!fromNumber) {
    throw new Error("Twilio phone not configured — set a Primary phone number for this company");
  }

  const normalizedTo = normalizePhone(params.to);
  const blocked = await isContactBlocked(params.user.companyId, normalizedTo, null);
  if (blocked) throw new Error("Contact is blocked");

  const mediaUrls = params.media
    .map((item) => {
      if (item.publicUrl?.includes("/api/twilio/mms/media")) return item.publicUrl;
      if (item.publicUrl && !isBlobStorageUrl(item.publicUrl)) return item.publicUrl;
      const pathname = pathnameFromBlobUrl(item.blobUrl);
      if (pathname) return twilioAccessibleMediaUrl(pathname);
      return item.publicUrl ?? item.blobUrl;
    })
    .filter(Boolean);

  if (!params.messageBody.trim() && !mediaUrls.length) {
    throw new Error("Message body or media required");
  }

  const resolvedCustomerId =
    params.scope === Scope.EXTERNAL
      ? await resolveCustomerIdForSmsPhone(
          params.user.companyId,
          normalizedTo,
          params.customerId
        )
      : params.customerId;

  let recipientTitle = params.title?.trim() || undefined;
  if (params.scope === Scope.INTERNAL && !recipientTitle && params.userId) {
    const employee = await prisma.user.findFirst({
      where: { id: params.userId, companyId: params.user.companyId },
      select: { name: true },
    });
    recipientTitle = employee?.name;
  }

  const twilioMessage = await sendSms({
    companyId: params.user.companyId,
    from: fromNumber,
    to: normalizedTo,
    body: params.messageBody,
    mediaUrl: mediaUrls.length ? mediaUrls : undefined,
    statusCallback: params.statusCallback,
  });

  const conversation = await findOrCreateSmsConversation({
    companyId: params.user.companyId,
    scope: params.scope,
    participantPhone: normalizedTo,
    customerId: resolvedCustomerId,
    title: recipientTitle,
  });

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: params.user.id,
      direction: "OUTBOUND",
      body: prefixOutboundSmsWithCompanyName(company.name, params.messageBody.trim()) ||
        (mediaUrls.length ? "[Media message]" : ""),
      twilioMessageSid: twilioMessage.sid,
      deliveryStatus: "queued",
      ...(params.media.length
        ? {
            media: {
              create: params.media.map((item) => ({
                blobUrl: item.blobUrl,
                fileName: item.fileName,
                mimeType: item.mimeType,
                sizeBytes: item.sizeBytes,
              })),
            },
          }
        : {}),
    },
    include: {
      media: true,
      sender: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  await markInboundConversationRead(params.user.companyId, conversation.id);

  return { conversation, message };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const scopeParam = request.nextUrl.searchParams.get("scope") ?? "external";
    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;
    const requestedFolder = request.nextUrl.searchParams.get("folder");
    const folder =
      scope === Scope.EXTERNAL && requestedFolder === "spam"
        ? "spam"
        : scope === Scope.EXTERNAL && requestedFolder !== "general"
          ? "open"
          : "general";
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const searchPhoneDigits = phoneDigitsKey(search);
    const blockedPhones = scope === Scope.EXTERNAL
      ? (await prisma.blockedContact.findMany({ where: { companyId: user.companyId, phone: { not: null } }, select: { phone: true } }))
          .map((entry) => entry.phone).filter((phone): phone is string => Boolean(phone))
      : [];

    const { fieldCustomerCommsWhere } = await import("@/lib/field/access");
    const fieldCommsWhere =
      scope === Scope.EXTERNAL ? await fieldCustomerCommsWhere(user) : null;
    if (fieldCommsWhere && fieldCommsWhere.customerId.in.length === 0) {
      return NextResponse.json([]);
    }

    const and: Prisma.ConversationWhereInput[] = [];
    if (scope === Scope.EXTERNAL && folder !== "spam" && blockedPhones.length) {
      and.push({
        OR: [
          { participantPhone: null },
          { participantPhone: { notIn: blockedPhones } },
        ],
      });
    }
    if (scope === Scope.EXTERNAL) {
      and.push({
        messages: {
          some: {
            NOT: { body: { startsWith: WEBSITE_FORM_SMS_BODY_STARTS_WITH } },
          },
        },
      });
    }
    // Searching from Open or General searches the full non-spam SMS inbox so a
    // customer can be found even when their workflow folder differs from the active tab.
    if (scope === Scope.EXTERNAL && folder === "open" && !search) {
      and.push({
        OR: [
          { smsOpen: true },
          {
            smsOpen: null,
            messages: {
              some: {
                direction: MessageDirection.INBOUND,
                readAt: null,
                NOT: { body: { startsWith: WEBSITE_FORM_SMS_BODY_STARTS_WITH } },
              },
            },
          },
        ],
      });
    }
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { participantPhone: { contains: search } },
          ...(searchPhoneDigits
            ? [{ participantPhone: { contains: searchPhoneDigits } }]
            : []),
          {
            customer: {
              is: {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      });
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: user.companyId,
        channel: Channel.SMS,
        scope,
        ...(folder === "spam"
          ? { participantPhone: { in: blockedPhones } }
          : {}),
        ...(fieldCommsWhere ?? {}),
        ...(and.length ? { AND: and } : {}),
      },
      include: {
        customer: true,
        messages: {
          where: {
            NOT: { body: { startsWith: WEBSITE_FORM_SMS_BODY_STARTS_WITH } },
          },
          orderBy: { sentAt: "desc" },
          take: 1,
          include: { media: true },
        },
        _count: {
          select: {
            messages: {
              where: {
                direction: MessageDirection.INBOUND,
                readAt: null,
                NOT: { body: { startsWith: WEBSITE_FORM_SMS_BODY_STARTS_WITH } },
              },
            },
          },
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    const rows = [];
    for (const conversation of conversations) {
      const { _count, customer, ...rest } = conversation;
      let customerId = conversation.customerId;
      let nextCustomer = customer;
      if (
        scope === Scope.EXTERNAL &&
        conversation.participantPhone &&
        customer?.phone &&
        !phonesMatch(customer.phone, conversation.participantPhone)
      ) {
        const nextId = await nextCustomerIdForSmsPhone({
          companyId: user.companyId,
          participantPhone: conversation.participantPhone,
          currentCustomerId: conversation.customerId,
        });
        if (nextId !== (conversation.customerId ?? null)) {
          const updated = await prisma.conversation.update({
            where: { id: conversation.id },
            data: { customerId: nextId },
            include: { customer: true },
          });
          customerId = updated.customerId;
          nextCustomer = updated.customer;
        }
      }
      rows.push({
        ...rest,
        customerId,
        customer: nextCustomer,
        unreadCount: _count.messages,
        needsResponse:
          (conversation.smsOpen === true ||
            (conversation.smsOpen === null && _count.messages > 0)) &&
          conversation.messages[0]?.direction === MessageDirection.INBOUND,
      });
    }

    return NextResponse.json(rows);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json()) as SendSmsBody;
    const {
      conversationId: requestedConversationId,
      body: messageBody = "",
      scope: scopeParam,
      title,
      userId,
      media = [],
    } = body;
    let { to, customerId } = body;

    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;
    const statusCallback = twilioSmsStatusCallbackUrl(request.nextUrl.origin);

    if (requestedConversationId) {
      const existing = await prisma.conversation.findFirst({
        where: {
          id: requestedConversationId,
          companyId: user.companyId,
          channel: Channel.SMS,
        },
        select: {
          participantPhone: true,
          customerId: true,
        },
      });
      if (!existing) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      if (!existing.participantPhone) {
        return badRequestResponse("Recipient phone required");
      }
      // An open thread is the source of truth — ignore leftover compose `to` / customerId.
      to = existing.participantPhone;
      customerId = existing.customerId ?? undefined;
    }

    if (!to) return badRequestResponse("Recipient phone required");

    if (scope === Scope.EXTERNAL) {
      const { canAccessFieldCustomerComms, FIELD_CUSTOMER_COMMS_FORBIDDEN } = await import(
        "@/lib/field/access"
      );
      const resolvedCustomerId = await resolveCustomerIdForSmsPhone(
        user.companyId,
        normalizePhone(to),
        customerId
      );
      if (!(await canAccessFieldCustomerComms(user, resolvedCustomerId))) {
        return forbiddenResponse(FIELD_CUSTOMER_COMMS_FORBIDDEN);
      }
    }

    const result = await sendSmsMessage({
      user,
      scope,
      to,
      messageBody,
      media: Array.isArray(media) ? media : [],
      statusCallback,
      customerId,
      title: requestedConversationId ? undefined : title,
      userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const commsDisabled = outboundCommsErrorResponse(error);
    if (commsDisabled) return commsDisabled;
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to send SMS";
    if (message === "Contact is blocked") return forbiddenResponse(message);
    if (message.includes("required") || message.includes("configured")) {
      return badRequestResponse(message);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
