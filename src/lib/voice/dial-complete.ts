import { NextRequest } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { buildQueueTwiml } from "@/lib/voice/routing";
import { twimlHangup, twimlResponse } from "@/lib/voice/twiml-response";

/**
 * Twilio requests the Dial `action` URL when a &lt;Dial&gt; finishes (including
 * when the agent hangs up after a connected call). Must always return valid
 * TwiML — JSON/500 responses play "an application error has occurred" to the
 * party still on the line (usually the customer).
 */
export async function handleDialComplete(request: NextRequest) {
  try {
    const params = await parseTwilioWebhook(request);
    if (!params) {
      return twimlHangup();
    }

    const companyId = request.nextUrl.searchParams.get("companyId");
    const dialStatus = (params.DialCallStatus ?? "").toLowerCase();

    // Connected call ended normally (either party hung up) — disconnect cleanly.
    if (dialStatus === "completed" || dialStatus === "answered" || dialStatus === "canceled") {
      return twimlHangup();
    }

    // Agent never picked up — send the waiting caller to the queue (inbound only).
    if (companyId && ["no-answer", "busy", "failed"].includes(dialStatus)) {
      if (params.CallSid) {
        await prisma.callSession.updateMany({
          where: { callSid: params.CallSid, companyId },
          data: {
            status: CallSessionStatus.RINGING,
            queueEnteredAt: new Date(),
          },
        });
      }

      const twiml = await buildQueueTwiml(companyId);
      return twimlResponse(twiml);
    }

    return twimlHangup();
  } catch (error) {
    console.error("[twilio/voice/dial-complete]", error);
    return twimlHangup();
  }
}
