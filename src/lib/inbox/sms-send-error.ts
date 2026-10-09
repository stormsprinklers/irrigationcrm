type ErrorWithMetadata = {
  code?: string | number;
  status?: number;
  message?: string;
};

export class SmsSentButNotRecordedError extends Error {
  readonly providerMessageSid: string;
  readonly originalError: unknown;

  constructor(providerMessageSid: string, originalError: unknown) {
    super("SMS was accepted by the provider but could not be saved in Radar");
    this.name = "SmsSentButNotRecordedError";
    this.providerMessageSid = providerMessageSid;
    this.originalError = originalError;
  }
}

export type SmsSendErrorDetails = {
  error: string;
  code: string;
  status: number;
};

const TWILIO_SEND_ERRORS: Record<string, string> = {
  "20003": "SMS authentication failed. An administrator needs to check the Twilio credentials.",
  "21211": "Enter a valid destination phone number.",
  "21408": "SMS is not enabled for this destination region in Twilio.",
  "21608": "This Twilio trial account can only text verified phone numbers.",
  "21610": "This recipient opted out of SMS. They must reply START before another message can be sent.",
  "21612": "The company phone number is not enabled for SMS in Twilio.",
  "21614": "This phone number cannot receive SMS messages.",
  "30007": "The carrier rejected this message as filtered content.",
  "30034": "The company phone number is not attached to an approved A2P messaging campaign.",
};

function errorMetadata(error: unknown): ErrorWithMetadata {
  return error && typeof error === "object" ? (error as ErrorWithMetadata) : {};
}

/**
 * Convert provider/database exceptions into short, actionable copy for the CRM.
 * The original exception must still be logged server-side for diagnosis.
 */
export function describeSmsSendError(error: unknown): SmsSendErrorDetails {
  if (error instanceof SmsSentButNotRecordedError) {
    return {
      error:
        "The text was sent, but Radar could not save it in the conversation. Refresh the thread before trying again.",
      code: "SMS_SENT_NOT_RECORDED",
      status: 500,
    };
  }

  const metadata = errorMetadata(error);
  const rawCode = metadata.code == null ? "" : String(metadata.code);
  const rawMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = rawMessage.toLowerCase();

  if (TWILIO_SEND_ERRORS[rawCode]) {
    return {
      error: TWILIO_SEND_ERRORS[rawCode],
      code: `TWILIO_${rawCode}`,
      status: rawCode === "20003" ? 502 : 400,
    };
  }
  if (normalized.includes("contact is blocked")) {
    return { error: "This phone number is blocked.", code: "CONTACT_BLOCKED", status: 403 };
  }
  if (normalized.includes("a2p") || normalized.includes("messaging service")) {
    return {
      error:
        "This company’s phone number is not ready for A2P messaging. Check Settings → Phone numbers.",
      code: "A2P_NOT_CONFIGURED",
      status: 400,
    };
  }
  if (normalized.includes("twilio") && normalized.includes("credential")) {
    return {
      error: "SMS is not configured correctly. An administrator needs to check the Twilio credentials.",
      code: "SMS_NOT_CONFIGURED",
      status: 502,
    };
  }
  if (normalized.includes("phone") && normalized.includes("not configured")) {
    return {
      error: "Set a primary SMS-capable phone number for this company before sending a text.",
      code: "SMS_NUMBER_NOT_CONFIGURED",
      status: 400,
    };
  }
  if (normalized.includes("recipient phone required")) {
    return { error: "Choose a recipient before sending.", code: "RECIPIENT_REQUIRED", status: 400 };
  }
  if (normalized.includes("message body or media required")) {
    return { error: "Enter a message or attach a file.", code: "MESSAGE_REQUIRED", status: 400 };
  }

  const isTwilioError =
    typeof metadata.status === "number" || /^\d{5}$/.test(rawCode);
  return {
    error: isTwilioError
      ? `Twilio could not send this message${rawCode ? ` (error ${rawCode})` : ""}.`
      : "Radar could not send this message. Try again, and contact an administrator if it keeps happening.",
    code: isTwilioError ? "TWILIO_SEND_FAILED" : "SMS_SEND_FAILED",
    status: isTwilioError ? 502 : 500,
  };
}
