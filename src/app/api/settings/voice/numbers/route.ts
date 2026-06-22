import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { syncCompanyTwilioPhone } from "@/lib/voice/company-phone";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const numbers = await prisma.phoneNumber.findMany({
      where: { companyId: user.companyId },
      include: {
        callFlow: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { e164: "asc" }],
    });
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
    const { e164, friendlyName, callFlowId, isPrimary, numberType, assignedUserId, trackingSource, twilioSid } = body;
    if (!e164) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    if (isPrimary) {
      await prisma.phoneNumber.updateMany({
        where: { companyId: user.companyId },
        data: { isPrimary: false },
      });
    }

    const number = await prisma.phoneNumber.create({
      data: {
        companyId: user.companyId,
        e164: normalizePhone(String(e164)),
        friendlyName: friendlyName ?? null,
        callFlowId: callFlowId ?? null,
        isPrimary: Boolean(isPrimary),
        numberType: numberType ?? "TRACKING",
        assignedUserId: assignedUserId ?? null,
        trackingSource: trackingSource ?? null,
        twilioSid: twilioSid ?? null,
      },
    });

    if (number.isPrimary || number.numberType === "PRIMARY") {
      await syncCompanyTwilioPhone(user.companyId, number.e164);
    }

    return NextResponse.json(number, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
