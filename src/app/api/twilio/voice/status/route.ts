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
  const parentCallSid = params.ParentCallSid;
  const sessionCallSid = parentCallSid || callSid;
  const callStatus = params.CallStatus;
  const from = params.From ?? "";
  const to = params.To ?? "";
  const duration = params.CallDuration ? parseInt(params.CallDuration, 10) : null;

  if (!callSid) return NextResponse.json({ ok: true });

  const session = await prisma.callSession.findUnique({
    where: { callSid: sessionCallSid },
    select: {
      id: true,
      companyId: true,
      direction: true,
      fromNumber: true,
      toNumber: true,
      customerId: true,
      assignedUserId: true,
    },
  });

  if (session) {
    const sessionStatus =
      callStatus === "completed"
        ? CallSessionStatus.COMPLETED
        : callStatus === "in-progress"
          ? CallSessionStatus.IN_PROGRESS
          : callStatus === "ringing"
            ? CallSessionStatus.RINGING
            : undefined;

    await prisma.callSession.update({
      where: { id: session.id },
      data: {
        ...(sessionStatus ? { status: sessionStatus } : {}),
        ...(callStatus === "completed" ? { endedAt: new Date() } : {}),
      },
    });
  }

  let company = session
    ? await prisma.company.findUnique({ where: { id: session.companyId } })
    : await getCompanyByTwilioPhone(to);

  let direction = session?.direction ?? CallDirection.INBOUND;
  let fromNumber = session?.fromNumber ?? normalizePhone(from);
  let toNumber = session?.toNumber ?? to;
  let customerId = session?.customerId ?? null;
  let userId = session?.assignedUserId ?? null;

  if (!company) {
    company = await getCompanyByTwilioPhone(from);
    if (company) {
      direction = CallDirection.OUTBOUND;
      fromNumber = normalizePhone(from);
      toNumber = normalizePhone(to);
    }
  }

  if (!company) return NextResponse.json({ ok: true });

  const logLookupSid = sessionCallSid;
  const existing =
    (await prisma.callLog.findUnique({ where: { twilioCallSid: logLookupSid } })) ??
    (session
      ? await prisma.callLog.findFirst({
          where: { sessionId: session.id },
          orderBy: { startedAt: "desc" },
        })
      : null);

  if (existing) {
    await prisma.callLog.update({
      where: { id: existing.id },
      data: {
        status: callStatus,
        durationSec: duration ?? existing.durationSec,
        endedAt: callStatus === "completed" ? new Date() : existing.endedAt,
        ...(session?.id && !existing.sessionId ? { sessionId: session.id } : {}),
        ...(userId && !existing.userId ? { userId } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (direction === CallDirection.INBOUND) {
    const normalizedFrom = normalizePhone(from);
    const blocked = await isContactBlocked(company.id, normalizedFrom, null);
    if (blocked) return NextResponse.json({ ok: true });

    if (!customerId) {
      const customer = await prisma.customer.findFirst({
        where: { companyId: company.id, phone: normalizedFrom },
      });
      customerId = customer?.id ?? null;
    }

    fromNumber = normalizedFrom;
  } else if (!customerId) {
    const customer = await prisma.customer.findFirst({
      where: { companyId: company.id, phone: toNumber },
    });
    customerId = customer?.id ?? null;
  }

  await prisma.callLog.create({
    data: {
      companyId: company.id,
      scope: Scope.EXTERNAL,
      direction,
      fromNumber,
      toNumber,
      customerId,
      userId,
      twilioCallSid: logLookupSid,
      sessionId: session?.id ?? null,
      status: callStatus,
      durationSec: duration,
      endedAt: callStatus === "completed" ? new Date() : null,
    },
  });

  return NextResponse.json({ ok: true });
}
