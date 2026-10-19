import { NextRequest, NextResponse } from "next/server";
import { isValidTwilioWebhookRequest } from "@/lib/inbox/twilio";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => { params[key] = String(value); });
  if (!process.env.TWILIO_AUTH_TOKEN || !isValidTwilioWebhookRequest(request, params)) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const session = params.CallSid
    ? await prisma.ownerAssistantSession.findUnique({
        where: { providerSid: params.CallSid },
        select: { id: true, status: true, transcript: true },
      })
    : null;
  if (!session) {
    return new NextResponse("<Response><Hangup/></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // A successful bridge writes at least the assistant greeting transcript. Do not
  // overwrite a FAILED status reported by the sideband with a misleading COMPLETED.
  const failed = session.status === "FAILED" || !session.transcript.trim();
  const providerDetail = [params.StreamError, params.ErrorMessage, params.ErrorCode]
    .find((value) => value?.trim())
    ?.trim()
    .slice(0, 300);
  const diagnostic = failed
    ? `\nSystem: Voice bridge ended before the assistant connected${providerDetail ? ` (${providerDetail})` : ""}. Check the owner-assistant Railway service health, port, SIDEBAND_MODE, CRM_BASE_URL, and OpenAI key.`
    : "";
  await prisma.ownerAssistantSession.update({
    where: { id: session.id },
    data: {
      status: failed ? "FAILED" : "COMPLETED",
      endedAt: new Date(),
      ...(diagnostic
        ? { transcript: `${session.transcript}${diagnostic}`.slice(-100_000) }
        : {}),
    },
  });

  const xml = failed
    ? "<Response><Say>I could not connect to the assistant service. The failure has been recorded in the Agents activity log.</Say><Hangup/></Response>"
    : "<Response><Hangup/></Response>";
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });
}
