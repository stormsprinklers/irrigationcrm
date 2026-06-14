import { NextRequest, NextResponse } from "next/server";
import { CallDirection, CallSessionStatus, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { getCompanyByTwilioPhone } from "@/lib/inbox/conversations";

export async function POST(request: NextRequest) {
  const params = await parseTwilioWebhook(request);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  const callSid = params.CallSid;
  const callStatus = params.CallStatus;
  const from = params.From;
  const to = params.To;
  const duration = params.CallDuration ? parseInt(params.CallDuration, 10) : null;

  if (callSid) {
    const sessionStatus =
      callStatus === "completed"
        ? CallSessionStatus.COMPLETED
        : callStatus === "in-progress"
          ? CallSessionStatus.IN_PROGRESS
          : callStatus === "ringing"
            ? CallSessionStatus.RINGING
            : undefined;

    await prisma.callSession.updateMany({
      where: { callSid },
      data: {
        ...(sessionStatus ? { status: sessionStatus } : {}),
        ...(callStatus === "completed" ? { endedAt: new Date() } : {}),
      },
    });
  }

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
