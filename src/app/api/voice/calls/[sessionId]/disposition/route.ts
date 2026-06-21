import { NextRequest, NextResponse } from "next/server";
import { CallDisposition } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const VALID_DISPOSITIONS: CallDisposition[] = [
  CallDisposition.BOOKED,
  CallDisposition.NOT_BOOKED,
  CallDisposition.NON_OPPORTUNITY,
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { sessionId } = await params;
    const body = await request.json();
    const { disposition, dispositionNote, visitId, leadId } = body as {
      disposition?: CallDisposition;
      dispositionNote?: string;
      visitId?: string;
      leadId?: string;
    };

    if (!disposition || !VALID_DISPOSITIONS.includes(disposition)) {
      return badRequestResponse("Valid disposition required (BOOKED, NOT_BOOKED, NON_OPPORTUNITY)");
    }

    const session = await prisma.callSession.findFirst({
      where: { id: sessionId, companyId: user.companyId },
    });
    if (!session) {
      return NextResponse.json({ error: "Call session not found" }, { status: 404 });
    }

    let resolvedVisitId = visitId ?? null;
    if (disposition === CallDisposition.BOOKED && !resolvedVisitId) {
      const linkedVisit = await prisma.visit.findFirst({
        where: { callSessionId: sessionId, companyId: user.companyId },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      resolvedVisitId = linkedVisit?.id ?? null;
    }

    const callLog = await prisma.callLog.findFirst({
      where: { sessionId, companyId: user.companyId },
      orderBy: { startedAt: "desc" },
    });

    if (callLog) {
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          disposition,
          dispositionNote: dispositionNote ?? null,
          visitId: resolvedVisitId,
          leadId: leadId ?? null,
          handledByUserId: user.id,
        },
      });
    } else {
      await prisma.callLog.create({
        data: {
          companyId: user.companyId,
          scope: "EXTERNAL",
          direction: session.direction,
          fromNumber: session.fromNumber,
          toNumber: session.toNumber,
          customerId: session.customerId,
          sessionId: session.id,
          twilioCallSid: session.callSid,
          status: "completed",
          disposition,
          dispositionNote: dispositionNote ?? null,
          visitId: resolvedVisitId,
          leadId: leadId ?? null,
          handledByUserId: user.id,
          endedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ ok: true, disposition });
  } catch {
    return unauthorizedResponse();
  }
}
