import { NextRequest } from "next/server";
import { CallSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTwilioWebhook } from "@/lib/voice/webhook";
import { conferenceJoinTwiml } from "@/lib/voice/conference";
import { buildVoicemailTwiml, ensureVoicemailCallLog } from "@/lib/voice/voicemail";
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
    const callSid = params.CallSid;
    const unanswered = ["no-answer", "busy", "failed"].includes(dialStatus);

    // Mid-call conference migration fires Dial complete with status "completed".
    // Rejoin only then — never for unanswered / timeout.
    if (
      callSid &&
      (dialStatus === "completed" || dialStatus === "answered") &&
      !unanswered
    ) {
      const session = await prisma.callSession.findFirst({
        where: {
          OR: [{ callSid }, { agentCallSid: callSid }],
        },
        select: {
          id: true,
          status: true,
          conferenceSid: true,
          agentCallSid: true,
          endedAt: true,
        },
      });

      if (
        session &&
        !session.endedAt &&
        session.status !== CallSessionStatus.COMPLETED &&
        (session.conferenceSid ||
          session.status === CallSessionStatus.ON_HOLD ||
          session.status === CallSessionStatus.TRANSFERRING)
      ) {
        const isAgent = session.agentCallSid === callSid;
        return twimlResponse(
          conferenceJoinTwiml(session.id, {
            endConferenceOnExit: !isAgent,
            record: false,
          })
        );
      }
    }

    // Nobody answered — take a voicemail (inbound with company context).
    // "canceled" covers some Twilio timeout variants where child legs cancel.
    if (companyId && (unanswered || dialStatus === "canceled")) {
      const session = callSid
        ? await prisma.callSession.findFirst({
            where: { callSid, companyId },
            select: { agentCallSid: true, status: true },
          })
        : null;
      // Skip voicemail if an agent had already answered (connected call ending oddly).
      const alreadyAnswered =
        Boolean(session?.agentCallSid) ||
        session?.status === CallSessionStatus.IN_PROGRESS ||
        session?.status === CallSessionStatus.ON_HOLD ||
        session?.status === CallSessionStatus.TRANSFERRING;

      if (!alreadyAnswered) {
        try {
          if (callSid) {
            await ensureVoicemailCallLog({
              companyId,
              callSid,
              from: params.From,
              to: params.To,
            });
          }
          const twiml = await buildVoicemailTwiml(companyId);
          return twimlResponse(twiml);
        } catch (err) {
          console.error("[twilio/voice/dial-complete] voicemail failed", err);
          return twimlResponse(
            "<Response><Say>We are sorry we missed your call. Please try again later. Goodbye.</Say><Hangup/></Response>"
          );
        }
      }
    }

    // Connected call ended normally (either party hung up after connect).
    if (dialStatus === "completed" || dialStatus === "answered") {
      return twimlHangup();
    }

    return twimlHangup();
  } catch (error) {
    console.error("[twilio/voice/dial-complete]", error);
    return twimlResponse(
      "<Response><Say>We are sorry we missed your call. Please try again later. Goodbye.</Say><Hangup/></Response>"
    );
  }
}
