import { NextRequest, NextResponse } from "next/server";
import { CallDirection, Scope } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse, badRequestResponse } from "@/lib/api-auth";
import { initiateOutboundCall } from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { to, customerId, scope: scopeParam } = body;

    if (!to) return badRequestResponse("Phone number required");

    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    if (!company?.twilioPhone) return badRequestResponse("Twilio phone not configured");

    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;
    const normalizedTo = normalizePhone(to);

    if (scope === Scope.EXTERNAL) {
      const blocked = await isContactBlocked(user.companyId, normalizedTo, null);
      if (blocked) {
        return NextResponse.json({ error: "Contact is blocked" }, { status: 403 });
      }
    }

    const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/twiml?to=${encodeURIComponent(normalizedTo)}`;

    const call = await initiateOutboundCall({
      from: company.twilioPhone,
      to: normalizedTo,
      url: twimlUrl,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/status`,
      record: company.recordCalls,
    });

    const callLog = await prisma.callLog.create({
      data: {
        companyId: user.companyId,
        scope,
        direction: CallDirection.OUTBOUND,
        fromNumber: company.twilioPhone,
        toNumber: normalizedTo,
        customerId: customerId ?? null,
        userId: user.id,
        twilioCallSid: call.sid,
        status: call.status,
      },
    });

    return NextResponse.json({ call, callLog });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initiate call" },
      { status: 500 }
    );
  }
}
