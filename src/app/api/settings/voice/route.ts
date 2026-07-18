import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCompanyCallerId } from "@/lib/voice/company-phone";
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
        skipIvrForKnownCustomers: true,
        queueWaitClipId: true,
        holdMusicClipId: true,
        businessHours: true,
        aiReceptionistEnabled: true,
        aiReceptionistMaxMinutes: true,
        aiReceptionistSmsConfirm: true,
        aiReceptionistTone: true,
        aiReceptionistPolicies: true,
        aiReceptionistKnowledge: true,
        queueWaitClip: { select: { id: true, name: true, blobUrl: true, mimeType: true } },
        holdMusicClip: { select: { id: true, name: true, blobUrl: true, mimeType: true } },
      },
    });

    const [numbers, flows, groups, clips, callerId] = await Promise.all([
      prisma.phoneNumber.count({ where: { companyId: user.companyId } }),
      prisma.callFlow.count({ where: { companyId: user.companyId } }),
      prisma.agentGroup.count({ where: { companyId: user.companyId } }),
      prisma.voiceClip.findMany({
        where: { companyId: user.companyId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, blobUrl: true, mimeType: true },
      }),
      getCompanyCallerId(user.companyId),
    ]);

    const twilioConfigured = Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_API_KEY &&
        process.env.TWILIO_TWIML_APP_SID
    );

    const sidebandConfigured = Boolean(process.env.SIDEBAND_PUBLIC_WSS_URL?.trim());

    return NextResponse.json({
      ...company,
      twilioPhone: callerId ?? company?.twilioPhone ?? null,
      clips,
      counts: { numbers, flows, groups },
      twilioConfigured,
      sidebandConfigured,
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
    const {
      recordCalls,
      transcribeCalls,
      skipIvrForKnownCustomers,
      businessHours,
      queueWaitClipId,
      holdMusicClipId,
      aiReceptionistEnabled,
      aiReceptionistMaxMinutes,
      aiReceptionistSmsConfirm,
      aiReceptionistTone,
      aiReceptionistPolicies,
      aiReceptionistKnowledge,
    } = body;

    if (queueWaitClipId !== undefined && queueWaitClipId !== null) {
      const clip = await prisma.voiceClip.findFirst({
        where: { id: String(queueWaitClipId), companyId: user.companyId },
      });
      if (!clip) {
        return NextResponse.json({ error: "Queue wait clip not found" }, { status: 400 });
      }
    }
    if (holdMusicClipId !== undefined && holdMusicClipId !== null) {
      const clip = await prisma.voiceClip.findFirst({
        where: { id: String(holdMusicClipId), companyId: user.companyId },
      });
      if (!clip) {
        return NextResponse.json({ error: "Hold music clip not found" }, { status: 400 });
      }
    }

    if (body.requireQueueHoldClips) {
      if (!queueWaitClipId || !holdMusicClipId) {
        return NextResponse.json(
          { error: "Queue wait audio and hold music clips are both required" },
          { status: 400 }
        );
      }
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(recordCalls !== undefined ? { recordCalls } : {}),
        ...(transcribeCalls !== undefined ? { transcribeCalls } : {}),
        ...(skipIvrForKnownCustomers !== undefined
          ? { skipIvrForKnownCustomers: Boolean(skipIvrForKnownCustomers) }
          : {}),
        ...(businessHours !== undefined ? { businessHours } : {}),
        ...(queueWaitClipId !== undefined
          ? { queueWaitClipId: queueWaitClipId ? String(queueWaitClipId) : null }
          : {}),
        ...(holdMusicClipId !== undefined
          ? { holdMusicClipId: holdMusicClipId ? String(holdMusicClipId) : null }
          : {}),
        ...(aiReceptionistEnabled !== undefined
          ? { aiReceptionistEnabled: Boolean(aiReceptionistEnabled) }
          : {}),
        ...(aiReceptionistMaxMinutes !== undefined
          ? {
              aiReceptionistMaxMinutes: Math.min(
                45,
                Math.max(5, Number(aiReceptionistMaxMinutes) || 12)
              ),
            }
          : {}),
        ...(aiReceptionistSmsConfirm !== undefined
          ? { aiReceptionistSmsConfirm: Boolean(aiReceptionistSmsConfirm) }
          : {}),
        ...(aiReceptionistTone !== undefined
          ? { aiReceptionistTone: String(aiReceptionistTone || "").trim() || null }
          : {}),
        ...(aiReceptionistPolicies !== undefined
          ? { aiReceptionistPolicies: String(aiReceptionistPolicies || "").trim() || null }
          : {}),
        ...(aiReceptionistKnowledge !== undefined
          ? { aiReceptionistKnowledge: String(aiReceptionistKnowledge || "").trim() || null }
          : {}),
      },
      select: {
        id: true,
        recordCalls: true,
        transcribeCalls: true,
        skipIvrForKnownCustomers: true,
        queueWaitClipId: true,
        holdMusicClipId: true,
        aiReceptionistEnabled: true,
        aiReceptionistMaxMinutes: true,
        aiReceptionistSmsConfirm: true,
        aiReceptionistTone: true,
        aiReceptionistPolicies: true,
        aiReceptionistKnowledge: true,
      },
    });

    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}
