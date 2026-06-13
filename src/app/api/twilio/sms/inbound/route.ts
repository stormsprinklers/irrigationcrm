import { NextRequest, NextResponse } from "next/server";
import { MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateTwilioSignature } from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { findOrCreateSmsConversation, getCompanyByTwilioPhone } from "@/lib/inbox/conversations";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (
    process.env.TWILIO_AUTH_TOKEN &&
    !validateTwilioSignature(signature, request.url, params)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From;
  const to = params.To;
  const body = params.Body;
  const messageSid = params.MessageSid;

  if (!from || !to || !body) return NextResponse.json({ ok: true });

  const company = await getCompanyByTwilioPhone(to);
  if (!company) return NextResponse.json({ ok: true });

  const normalizedFrom = normalizePhone(from);
  const blocked = await isContactBlocked(company.id, normalizedFrom, null);
  if (blocked) return NextResponse.json({ ok: true });

  const customer = await prisma.customer.findFirst({
    where: { companyId: company.id, phone: normalizedFrom },
  });

  const conversation = await findOrCreateSmsConversation({
    companyId: company.id,
    scope: Scope.EXTERNAL,
    participantPhone: normalizedFrom,
    customerId: customer?.id,
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      body,
      twilioMessageSid: messageSid,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
