import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
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
        recordCalls: true,
        transcribeCalls: true,
        businessHours: true,
      },
    });

    const [numbers, flows, groups] = await Promise.all([
      prisma.phoneNumber.count({ where: { companyId: user.companyId } }),
      prisma.callFlow.count({ where: { companyId: user.companyId } }),
      prisma.agentGroup.count({ where: { companyId: user.companyId } }),
    ]);

    const twilioConfigured = Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_API_KEY &&
        process.env.TWILIO_TWIML_APP_SID
    );

    return NextResponse.json({
      ...company,
      counts: { numbers, flows, groups },
      twilioConfigured,
      webhooks: {
        voiceInbound: "/api/twilio/voice/inbound",
        voiceClient: "/api/twilio/voice/client",
        voiceStatus: "/api/twilio/voice/status",
        voiceRecording: "/api/twilio/voice/recording",
        voiceTranscription: "/api/twilio/voice/transcription",
        smsInbound: "/api/twilio/sms/inbound",
        smsStatus: "/api/twilio/sms/status",
        emailInbound: "/api/sendgrid/inbound",
        emailEvents: "/api/sendgrid/events",
      },
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
    const { recordCalls, transcribeCalls, businessHours } = body;

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(recordCalls !== undefined ? { recordCalls } : {}),
        ...(transcribeCalls !== undefined ? { transcribeCalls } : {}),
        ...(businessHours !== undefined ? { businessHours } : {}),
      },
    });

    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}
