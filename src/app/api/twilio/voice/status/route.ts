import { NextRequest, NextResponse } from "next/server";
import { CallDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateTwilioSignature } from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { getCompanyByTwilioPhone } from "@/lib/inbox/conversations";

async function parseTwilioBody(request: NextRequest) {
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
    return null;
  }
  return params;
}

export async function POST(request: NextRequest) {
  const params = await parseTwilioBody(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const callSid = params.CallSid;
  const callStatus = params.CallStatus;
  const from = params.From;
  const to = params.To;
  const duration = params.CallDuration ? parseInt(params.CallDuration, 10) : null;

  const company = await getCompanyByTwilioPhone(to);
  if (!company) return NextResponse.json({ ok: true });

  const existing = await prisma.callLog.findUnique({ where: { twilioCallSid: callSid } });

  if (existing) {
    await prisma.callLog.update({
      where: { twilioCallSid: callSid },
      data: {
        status: callStatus,
        durationSec: duration ?? existing.durationSec,
        endedAt: callStatus === "completed" ? new Date() : existing.endedAt,
      },
    });
    return NextResponse.json({ ok: true });
  }

  const normalizedFrom = normalizePhone(from);
  const blocked = await isContactBlocked(company.id, normalizedFrom, null);
  if (blocked) return NextResponse.json({ ok: true });

  const customer = await prisma.customer.findFirst({
    where: { companyId: company.id, phone: normalizedFrom },
  });

  await prisma.callLog.create({
    data: {
      companyId: company.id,
      scope: Scope.EXTERNAL,
      direction: CallDirection.INBOUND,
      fromNumber: normalizedFrom,
      toNumber: to,
      customerId: customer?.id,
      twilioCallSid: callSid,
      status: callStatus,
      durationSec: duration,
    },
  });

  return NextResponse.json({ ok: true });
}
