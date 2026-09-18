import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import {
  getTwilioWebhookUrlCandidates,
  isValidTwilioWebhookRequest,
} from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone, blockCustomer, unblockContactByPhone } from "@/lib/inbox/contacts";
import {
  optInCustomerMarketingSms,
  optOutCustomerMarketingSms,
} from "@/lib/marketing/opt-out";
import {
  isExactSmsStart,
  isExactSmsStop,
  marketingSmsStartReply,
  marketingSmsStopReply,
} from "@/lib/inbox/sms-opt-keywords";
import {
  findExistingSmsConversationAnyScope,
  findOrCreateSmsConversation,
  inboundSmsViaLinePrefix,
  resolveInboundSmsLine,
} from "@/lib/inbox/conversations";
import { parseTwilioMediaParams, downloadTwilioMedia } from "@/lib/inbox/twilio-media";
import { messageSharesContactInfo } from "@/lib/inbox/contact-info-detection";
import { processInboundMessageContactInfo } from "@/lib/inbox/contact-info-process";
import { notifyInboundSms } from "@/lib/notifications/in-app";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

export const maxDuration = 60;

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
    // Any company line (Primary, tracking, agent) → that company's shared SMS inbox.
    const inboundLine = await resolveInboundSmsLine(to);
    if (!inboundLine) {
      console.error("Twilio SMS inbound: no company for To number", { to });
      return NextResponse.json({ ok: true });
    }
    const company = inboundLine.company;

    const normalizedFrom = normalizePhone(from);
    const companyName = company.name?.trim() || "us";

    if (isExactSmsStop(body)) {
      const customer = await findCustomerByPhone(company.id, normalizedFrom);
      if (customer) {
        await optOutCustomerMarketingSms({
          customerId: customer.id,
          companyId: company.id,
        });
      }
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
      return twilioSmsReply(marketingSmsStopReply(companyName));
    }

    const isStart = isExactSmsStart(body);
    const spamBlock = isStart ? await prisma.blockedContact.findFirst({
        where: { companyId: company.id, phone: normalizedFrom, reason: "SMS spam" },
        select: { id: true },
      }) : null;
    if (isStart && !spamBlock) {
      const customer = await findCustomerByPhone(company.id, normalizedFrom);
      if (customer) {
        await optInCustomerMarketingSms({
          customerId: customer.id,
          companyId: company.id,
        });
      }
      await unblockContactByPhone(company.id, normalizedFrom);
      return twilioSmsReply(marketingSmsStartReply(companyName));
    }

    const blocked = await isContactBlocked(company.id, normalizedFrom, null);
    // Keep blocked inbound messages visible in Spam without notifying or triggering flows.

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

    const contactInfoDetected =
      !blocked && scope === Scope.EXTERNAL && body.trim() ? messageSharesContactInfo(body) : false;

    const trimmedBody = body.trim() || (mediaItems.length ? "[Media message]" : "");
    const viaPrefix = inboundSmsViaLinePrefix(inboundLine);
    const storedBody =
      viaPrefix && trimmedBody ? `${viaPrefix}\n${trimmedBody}` : trimmedBody;

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        body: storedBody,
        twilioMessageSid: messageSid || null,
        contactInfoDetected,
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

    // First-touch attribution from dialed tracking number / LSA caller match
    if (!blocked) void (async () => {
      try {
        const { AttributionFirstTouchMethod } = await import("@prisma/client");
        const {
          normalizeAttribution,
          recordTouchEvent,
          resolvePersonByPhone,
        } = await import("@/lib/attribution");
        const { matchGoogleLsaLeadByCallerPhone } = await import(
          "@/lib/voice/call-attribution"
        );

        const phoneRecord = inboundLine.phoneNumber;

        let trackingSource = phoneRecord?.trackingSource?.trim() || null;
        let googleLsaLeadId: string | null = null;
        let attributionMethod = "tracking_number";

        if (!trackingSource) {
          googleLsaLeadId = await matchGoogleLsaLeadByCallerPhone(
            company.id,
            normalizedFrom,
            new Date()
          );
          if (googleLsaLeadId) {
            trackingSource = "Google LSA";
            attributionMethod = "lsa_caller_match";
          }
        }

        let customerId = customer?.id ?? conversation.customerId ?? null;
        let leadId: string | null = null;
        if (!customerId) {
          const matched = await resolvePersonByPhone(company.id, normalizedFrom);
          customerId = matched.customerId;
          leadId = matched.leadId;
        }

        const normalized = normalizeAttribution({
          trackingSource: trackingSource ?? "unknown",
          attributionMethod,
          leadSource: trackingSource,
        });

        await recordTouchEvent({
          companyId: company.id,
          customerId,
          leadId,
          conversationId: conversation.id,
          eventType: "INBOUND_SMS",
          method:
            attributionMethod === "lsa_caller_match"
              ? AttributionFirstTouchMethod.LSA
              : AttributionFirstTouchMethod.SMS,
          normalized,
          phone: normalizedFrom,
          metadata: {
            trackingSource,
            googleLsaLeadId,
            dialedNumber: to,
            phoneNumberId: phoneRecord?.id ?? null,
            viaNonPrimaryLine: !inboundLine.isPrimaryLine,
          },
        });
      } catch (err) {
        console.error("SMS attribution failed", err);
      }
    })();

    if (!blocked) notifyInboundSms({
      companyId: company.id,
      conversationId: conversation.id,
      fromLabel: customer?.name ?? formatPhoneDisplay(normalizedFrom),
      preview: storedBody || (mediaItems.length ? "[Media message]" : "New message"),
      scope: conversation.scope,
      participantPhone: conversation.participantPhone,
      fromPhone: normalizedFrom,
    }).catch((err) => console.error("In-app notification failed for inbound SMS", err));

    if (contactInfoDetected) {
      void processInboundMessageContactInfo(message.id).catch((err) =>
        console.error("SMS contact info processing failed", err)
      );
    }

    if (!blocked && trimmedBody) {
      after(async () => {
        try {
          const { advanceWaitOnCustomerReply } = await import("@/lib/marketing/flow-engine");
          await advanceWaitOnCustomerReply({
            companyId: company.id,
            customerId: customer?.id,
            fromPhone: normalizedFrom,
            text: trimmedBody,
            channel: "sms",
            receivedAt: message.sentAt,
          });
        } catch (err) {
          console.error("Campaign wait reply processing failed", err);
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Twilio SMS inbound handler error", error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

function twilioSmsReply(message: string) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}
