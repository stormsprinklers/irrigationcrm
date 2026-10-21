import { NextRequest, NextResponse } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTwilioClient } from "@/lib/inbox/twilio";
import { prisma } from "@/lib/prisma";
import { queueSidByFriendlyName } from "@/lib/voice/call-queue";
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
    // Twilio's queue accessor requires a QU... SID, not the friendly name used
    // by <Enqueue>. Passing queueName directly leaves the caller on hold and
    // makes every pickup attempt fail.
    const queues = await client.queues.list({ limit: 1000 });
    const queueSid = queueSidByFriendlyName(queues, queueName);
    if (!queueSid) {
      return NextResponse.json(
        { error: "The live Twilio queue could not be found. Refresh and try again." },
        { status: 409 }
      );
    }
    const members = await client.queues(queueSid).members.list();
    const member = members.find((m) => m.callSid === session.callSid);

    if (!member) {
      return NextResponse.json(
        { error: "This caller is no longer in the live queue. Refresh the queue." },
        { status: 409 }
      );
    }
    await client.queues(queueSid).members(member.callSid).update({
      url: `${appBaseUrl()}/api/twilio/voice/dequeue?companyId=${user.companyId}&userId=${user.id}`,
      method: "POST",
    });

    await prisma.callSession.update({
      where: { id: session.id },
      data: {
        assignedUserId: user.id,
        // The browser invite has only started ringing. bindCall records the
        // answer and agent CallSid after the CSR actually accepts it.
        status: CallSessionStatus.RINGING,
        queueEnteredAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accept failed" },
      { status: 500 }
    );
  }
}
