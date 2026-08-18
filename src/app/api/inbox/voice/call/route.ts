import { NextRequest, NextResponse } from "next/server";
import { CallDirection, Scope } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse, badRequestResponse } from "@/lib/api-auth";
import { initiateOutboundCall } from "@/lib/inbox/twilio";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { getCompanyCallerId } from "@/lib/voice/company-phone";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { to, customerId, scope: scopeParam } = body;

    if (!to) return badRequestResponse("Phone number required");

    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    const callerId = await getCompanyCallerId(user.companyId);
    if (!callerId || !company) return badRequestResponse("Twilio phone not configured");

    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;
    const normalizedTo = normalizePhone(to);

    if (scope === Scope.EXTERNAL) {
      const blocked = await isContactBlocked(user.companyId, normalizedTo, null);
      if (blocked) {
        return NextResponse.json({ error: "Contact is blocked" }, { status: 403 });
      }
      const { canAccessFieldCustomerComms, FIELD_CUSTOMER_COMMS_FORBIDDEN } = await import(
        "@/lib/field/access"
      );
      const { findCustomerByPhone } = await import("@/lib/inbox/customer-lookup");
      const { forbiddenResponse } = await import("@/lib/api-auth");
      let resolvedCustomerId = typeof customerId === "string" ? customerId : undefined;
      if (!resolvedCustomerId) {
        const customer = await findCustomerByPhone(user.companyId, normalizedTo);
        resolvedCustomerId = customer?.id;
      }
      if (!(await canAccessFieldCustomerComms(user, resolvedCustomerId))) {
        return forbiddenResponse(FIELD_CUSTOMER_COMMS_FORBIDDEN);
      }
    }

    const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/twiml?to=${encodeURIComponent(normalizedTo)}`;

    const call = await initiateOutboundCall({
      companyId: user.companyId,
      from: callerId,
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
        fromNumber: callerId,
        toNumber: normalizedTo,
        customerId: customerId ?? null,
        userId: user.id,
        twilioCallSid: call.sid,
        status: call.status,
      },
    });

    return NextResponse.json({ call, callLog });
  } catch (error) {
    const commsDisabled = outboundCommsErrorResponse(error);
    if (commsDisabled) return commsDisabled;
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to initiate call" },
      { status: 500 }
    );
  }
}
