import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTwilioEmailAuthStatus } from "@/lib/inbox/email";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        name: true,
        twilioPhone: true,
        sendgridFrom: true,
        sendgridInboundDomain: true,
        recordCalls: true,
        transcribeCalls: true,
      },
    });
    return NextResponse.json({
      ...company,
      emailAuth: getTwilioEmailAuthStatus(),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { twilioPhone, sendgridFrom, sendgridInboundDomain, recordCalls, transcribeCalls } =
      body;

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(twilioPhone !== undefined ? { twilioPhone } : {}),
        ...(sendgridFrom !== undefined ? { sendgridFrom } : {}),
        ...(sendgridInboundDomain !== undefined ? { sendgridInboundDomain } : {}),
        ...(recordCalls !== undefined ? { recordCalls } : {}),
        ...(transcribeCalls !== undefined ? { transcribeCalls } : {}),
      },
    });

    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}
