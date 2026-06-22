import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getTwilioClient } from "@/lib/inbox/twilio";
import { prisma } from "@/lib/prisma";
import { twilioRecordingMediaUrl } from "@/lib/voice/recording";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const call = await prisma.callLog.findFirst({
      where: { id, companyId: user.companyId },
      select: { recordingUrl: true },
    });

    if (!call?.recordingUrl) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
    }

    const mediaUrl = twilioRecordingMediaUrl(call.recordingUrl);
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const upstream = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!upstream.ok) {
      // Fallback: resolve via Twilio SDK when stored URL is stale.
      const recordingSid = call.recordingUrl.match(/Recordings\/(RE[a-f0-9]+)/i)?.[1];
      if (recordingSid) {
        const client = getTwilioClient();
        const recording = await client.recordings(recordingSid).fetch();
        const uri = recording.uri?.replace(".json", ".mp3");
        if (uri) {
          const resolved = await fetch(`https://api.twilio.com${uri}`, {
            headers: { Authorization: `Basic ${auth}` },
          });
          if (resolved.ok) {
            return new NextResponse(resolved.body, {
              headers: {
                "Content-Type": resolved.headers.get("content-type") ?? "audio/mpeg",
                "Cache-Control": "private, max-age=3600",
              },
            });
          }
        }
      }
      return NextResponse.json({ error: "Failed to load recording" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}
