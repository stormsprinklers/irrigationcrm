import { NextRequest, NextResponse } from "next/server";
import { renderIvrNodeById } from "@/lib/voice/ivr";
import { buildVoicemailTwiml } from "@/lib/voice/voicemail";

/**
 * Enqueue action URL — only send the caller to voicemail when they left via
 * <Leave> (pressed the configured queue key). Other QueueResults (agent
 * answer/redirect, hangup, bridged) must not record a message.
 */
async function handleEnqueueAction(request: NextRequest) {
  let queueResult =
    request.nextUrl.searchParams.get("QueueResult") ??
    request.nextUrl.searchParams.get("queueResult");

  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      const fromForm = formData.get("QueueResult");
      if (fromForm != null) queueResult = String(fromForm);
    } catch {
      // fall through
    }
  }

  if (queueResult !== "leave") {
    // Agent answer uses REST redirect (QueueResult=redirected). Do not Hangup —
    // that would race the dequeue and drop the caller. Empty response is a no-op.
    return new NextResponse("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const companyId = request.nextUrl.searchParams.get("companyId");
  const flowId = request.nextUrl.searchParams.get("flowId");
  const nodeId = request.nextUrl.searchParams.get("nodeId");

  if (!companyId) {
    return new NextResponse(
      "<Response><Say>Goodbye.</Say><Hangup/></Response>",
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  if (flowId && nodeId) {
    const twiml = await renderIvrNodeById(nodeId, flowId, companyId);
    if (twiml) {
      return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
    }
  }

  const twiml = await buildVoicemailTwiml(companyId);
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(request: NextRequest) {
  return handleEnqueueAction(request);
}

export async function GET(request: NextRequest) {
  return handleEnqueueAction(request);
}
