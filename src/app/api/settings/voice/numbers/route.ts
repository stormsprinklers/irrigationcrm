import { NextRequest, NextResponse } from "next/server";
import { PhoneNumberType } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { syncCompanyTwilioPhone } from "@/lib/voice/company-phone";
import { fetchTwilioNumberCapabilitiesBySid } from "@/lib/twilio/numbers";
import { setExclusivePrimaryNumber } from "@/lib/twilio/primary-number";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    let numbers = await prisma.phoneNumber.findMany({
      where: { companyId: user.companyId },
      include: {
        callFlow: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { e164: "asc" }],
    });

    // Refresh SMS/voice capabilities from Twilio when any linked number is unknown or stale.
    const needsCaps = numbers.some((n) => n.twilioSid && n.smsEnabled == null);
    if (needsCaps) {
      const caps = await fetchTwilioNumberCapabilitiesBySid();
      if (caps.size) {
        await Promise.all(
          numbers
            .filter((n) => n.twilioSid && caps.has(n.twilioSid))
            .map((n) => {
              const c = caps.get(n.twilioSid!)!;
              return prisma.phoneNumber.update({
                where: { id: n.id },
                data: { smsEnabled: c.smsEnabled, voiceEnabled: c.voiceEnabled },
              });
            })
        );
        numbers = await prisma.phoneNumber.findMany({
          where: { companyId: user.companyId },
          include: {
            callFlow: { select: { id: true, name: true } },
            assignedUser: { select: { id: true, name: true } },
          },
          orderBy: [{ isPrimary: "desc" }, { e164: "asc" }],
        });
      }
    }

    return NextResponse.json(numbers);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load phone numbers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { e164, friendlyName, callFlowId, isPrimary, numberType, assignedUserId, trackingSource, twilioSid } =
      body;
    if (!e164) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    const wantPrimary =
      Boolean(isPrimary) || numberType === "PRIMARY" || numberType === PhoneNumberType.PRIMARY;

    const number = await prisma.phoneNumber.create({
      data: {
        companyId: user.companyId,
        e164: normalizePhone(String(e164)),
        friendlyName: friendlyName ?? null,
        callFlowId: callFlowId ?? null,
        isPrimary: wantPrimary,
        numberType: wantPrimary ? PhoneNumberType.PRIMARY : (numberType ?? "TRACKING"),
        assignedUserId: assignedUserId ?? null,
        trackingSource: trackingSource ?? null,
        twilioSid: twilioSid ?? null,
      },
    });

    if (wantPrimary) {
      await setExclusivePrimaryNumber({ companyId: user.companyId, numberId: number.id });
      await syncCompanyTwilioPhone(user.companyId, number.e164);
      const refreshed = await prisma.phoneNumber.findUnique({ where: { id: number.id } });
      return NextResponse.json(refreshed ?? number, { status: 201 });
    }

    return NextResponse.json(number, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
