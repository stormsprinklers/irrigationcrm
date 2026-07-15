import { NextRequest, NextResponse } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTwilioClient } from "@/lib/inbox/twilio";
import { prisma } from "@/lib/prisma";
import { recordCallAnswered } from "@/lib/voice/call-conversion";
import { appBaseUrl } from "@/lib/voice/identity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const session = await prisma.callSession.findFirst({
      where: { id, companyId: user.companyId, queueEnteredAt: { not: null } },
    });
    if (!session) {
      return NextResponse.json({ error: "Queue entry not found" }, { status: 404 });
    }

    const client = getTwilioClient();
    const queueName = `company_${user.companyId}`;
    const members = await client.queues(queueName).members.list();
    const member = members.find((m) => m.callSid === session.callSid);

    if (member) {
      await client.queues(queueName).members(member.callSid).update({
        url: `${appBaseUrl()}/api/twilio/voice/dequeue?companyId=${user.companyId}&userId=${user.id}`,
        method: "POST",
      });
    }

    await prisma.callSession.update({
      where: { id: session.id },
      data: {
        assignedUserId: user.id,
        status: CallSessionStatus.IN_PROGRESS,
        queueEnteredAt: null,
      },
    });

    await recordCallAnswered({
      companyId: user.companyId,
      sessionId: session.id,
      userId: user.id,
    }).catch((err) => console.error("Queue accept: recordCallAnswered failed", err));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accept failed" },
      { status: 500 }
    );
  }
}
