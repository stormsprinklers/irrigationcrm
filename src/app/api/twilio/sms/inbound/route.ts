import { NextRequest, NextResponse } from "next/server";
import { MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateTwilioSignature } from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone, blockCustomer } from "@/lib/inbox/contacts";
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
  const normalizedBody = body.trim().toUpperCase();

  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalizedBody)) {
    const customer = await prisma.customer.findFirst({
      where: { companyId: company.id, phone: normalizedFrom },
    });
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

  const customer = await prisma.customer.findFirst({
    where: { companyId: company.id, phone: normalizedFrom },
  });

  const employee = await prisma.user.findFirst({
    where: { companyId: company.id, phone: normalizedFrom, status: "ACTIVE" },
    select: { id: true, name: true },
  });

  const scope = employee && !customer ? Scope.INTERNAL : Scope.EXTERNAL;

  const conversation = await findOrCreateSmsConversation({
    companyId: company.id,
    scope,
    participantPhone: normalizedFrom,
    customerId: customer?.id,
    title: employee?.name,
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
