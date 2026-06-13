import { NextRequest, NextResponse } from "next/server";
import { Scope, Channel } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse, badRequestResponse, forbiddenResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { sendSms } from "@/lib/inbox/twilio";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const scopeParam = request.nextUrl.searchParams.get("scope") ?? "external";
    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;

    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: user.companyId,
        channel: scope === Scope.INTERNAL ? Channel.INTERNAL_CHAT : Channel.SMS,
        scope,
      },
      include: {
        customer: true,
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    return NextResponse.json(conversations);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { to, body: messageBody, customerId, scope: scopeParam, title } = body;

    if (!messageBody?.trim()) return badRequestResponse("Message body required");

    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;

    if (scope === Scope.EXTERNAL) {
      if (!to) return badRequestResponse("Recipient phone required");

      const company = await prisma.company.findUnique({ where: { id: user.companyId } });
      if (!company?.twilioPhone) return badRequestResponse("Twilio phone not configured");

      const normalizedTo = normalizePhone(to);
      const blocked = await isContactBlocked(user.companyId, normalizedTo, null);
      if (blocked) return forbiddenResponse("Contact is blocked");

      const twilioMessage = await sendSms({
        from: company.twilioPhone,
        to: normalizedTo,
        body: messageBody,
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/sms/status`,
      });

      const conversation = await findOrCreateSmsConversation({
        companyId: user.companyId,
        scope: Scope.EXTERNAL,
        participantPhone: normalizedTo,
        customerId,
      });

      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: user.id,
          direction: "OUTBOUND",
          body: messageBody,
          twilioMessageSid: twilioMessage.sid,
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      return NextResponse.json({ conversation, message });
    }

    const conversation = await findOrCreateSmsConversation({
      companyId: user.companyId,
      scope: Scope.INTERNAL,
      title: title ?? "Direct Message",
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        direction: "OUTBOUND",
        body: messageBody,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return NextResponse.json({ conversation, message });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send SMS" },
      { status: 500 }
    );
  }
}
