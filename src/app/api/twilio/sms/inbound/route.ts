import { NextRequest, NextResponse } from "next/server";
import { MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import {
  getTwilioWebhookUrlCandidates,
  isValidTwilioWebhookRequest,
} from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone, blockCustomer } from "@/lib/inbox/contacts";
import {
  findExistingSmsConversationAnyScope,
  findOrCreateSmsConversation,
  getCompanyByTwilioPhone,
} from "@/lib/inbox/conversations";
import { parseTwilioMediaParams, downloadTwilioMedia } from "@/lib/inbox/twilio-media";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  if (
    process.env.TWILIO_AUTH_TOKEN &&
    !isValidTwilioWebhookRequest(request, params)
  ) {
    console.error("Twilio SMS inbound signature validation failed", {
      urls: getTwilioWebhookUrlCandidates(request),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From;
  const to = params.To;
  const body = params.Body ?? "";
  const messageSid = params.MessageSid;
  const numMedia = Number(params.NumMedia ?? "0");

  if (!from || !to) return NextResponse.json({ ok: true });

  try {
    const company = await getCompanyByTwilioPhone(to);
    if (!company) {
      console.error("Twilio SMS inbound: no company for To number", { to });
      return NextResponse.json({ ok: true });
    }

    const normalizedFrom = normalizePhone(from);
    const normalizedBody = body.trim().toUpperCase();

    if (
      normalizedBody &&
      ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalizedBody)
    ) {
      const customer = await findCustomerByPhone(company.id, normalizedFrom);
      const admin = await prisma.user.findFirst({
        where: { companyId: company.id, role: "ADMIN" },
        select: { id: true },
      });
      if (admin) {
        await blockCustomer({
          companyId: company.id,
          blockedBy: admin.id,
          customerId: customer?.id,
          phone: normalizedFrom,
          reason: "SMS STOP opt-out",
        });
      }
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed.</Message></Response>',
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    const blocked = await isContactBlocked(company.id, normalizedFrom, null);
    if (blocked) return NextResponse.json({ ok: true });

    const customer = await findCustomerByPhone(company.id, normalizedFrom);

    const existingConversation = await findExistingSmsConversationAnyScope({
      companyId: company.id,
      participantPhone: normalizedFrom,
    });

    let scope = existingConversation?.scope ?? Scope.EXTERNAL;

    if (!existingConversation) {
      const employee = await prisma.user.findFirst({
        where: {
          companyId: company.id,
          status: "ACTIVE",
          OR: [{ phone: normalizedFrom }, { phone: from }],
        },
        select: { id: true, name: true },
      });
      scope = customer ? Scope.EXTERNAL : employee ? Scope.INTERNAL : Scope.EXTERNAL;
    }

    const employee =
      scope === Scope.INTERNAL && !existingConversation?.title
        ? await prisma.user.findFirst({
            where: {
              companyId: company.id,
              status: "ACTIVE",
              OR: [{ phone: normalizedFrom }, { phone: from }],
            },
            select: { name: true },
          })
        : null;

    const conversation =
      existingConversation ??
      (await findOrCreateSmsConversation({
        companyId: company.id,
        scope,
        participantPhone: normalizedFrom,
        customerId: customer?.id,
        title: employee?.name,
      }));

    if (!body.trim() && numMedia <= 0) {
      return NextResponse.json({ ok: true });
    }

    if (messageSid) {
      const duplicate = await prisma.message.findUnique({
        where: { twilioMessageSid: messageSid },
        select: { id: true },
      });
      if (duplicate) return NextResponse.json({ ok: true });
    }

    const mediaItems = parseTwilioMediaParams(params);

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        body: body.trim() || (mediaItems.length ? "[Media message]" : ""),
        twilioMessageSid: messageSid || null,
      },
    });

    if (mediaItems.length) {
      const saved = await Promise.all(
        mediaItems.map((item, index) =>
          downloadTwilioMedia({
            mediaUrl: item.url,
            companyId: company.id,
            messageId: message.id,
            mimeType: item.contentType,
            index,
          })
        )
      );

      await prisma.messageMedia.createMany({
        data: saved.map((item) => ({
          messageId: message.id,
          blobUrl: item.blobUrl,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
        })),
      });
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        ...(customer && !conversation.customerId ? { customerId: customer.id } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Twilio SMS inbound handler error", error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
