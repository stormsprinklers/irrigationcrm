import { NextRequest, NextResponse } from "next/server";
import { MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { getTwilioWebhookUrl, validateTwilioSignature } from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone, blockCustomer } from "@/lib/inbox/contacts";
import { findOrCreateSmsConversation, getCompanyByTwilioPhone } from "@/lib/inbox/conversations";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const webhookUrl = getTwilioWebhookUrl(request);
  if (
    process.env.TWILIO_AUTH_TOKEN &&
    !validateTwilioSignature(signature, webhookUrl, params)
  ) {
    console.error("Twilio SMS inbound signature validation failed", { webhookUrl });
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From;
  const to = params.To;
  const body = params.Body ?? "";
  const messageSid = params.MessageSid;

  if (!from || !to) return NextResponse.json({ ok: true });

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

  const employee = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      status: "ACTIVE",
      OR: [{ phone: normalizedFrom }, { phone: from }],
    },
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

  if (!body.trim() && !params.NumMedia) {
    return NextResponse.json({ ok: true });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      body: body.trim() || "[Media message]",
      twilioMessageSid: messageSid,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
