export type CallSummaryContext = {
  direction: "INBOUND" | "OUTBOUND";
  employeeName?: string | null;
  customerName?: string | null;
};

const VOICEMAIL_GREETING_PATTERNS = [
  /\bplease leave (?:your|a) message\b/i,
  /\bleave (?:your|a) message after (?:the )?(?:tone|beep)\b/i,
  /\bhas been forwarded to (?:an )?(?:automated|automatic) voice messaging system\b/i,
  /\b(?:the person|your party|the subscriber) (?:you (?:are|have) called )?is (?:not available|unavailable)\b/i,
];

export function isLikelyOutboundVoicemailTranscript(
  transcript: string,
  direction: CallSummaryContext["direction"]
): boolean {
  if (direction !== "OUTBOUND") return false;
  const opening = transcript.trim().slice(0, 500);
  return VOICEMAIL_GREETING_PATTERNS.some((pattern) => pattern.test(opening));
}

export function buildCallSummaryUserMessage(
  transcript: string,
  context: CallSummaryContext
): string {
  const outboundVoicemail = isLikelyOutboundVoicemailTranscript(
    transcript,
    context.direction
  );
  const employee = context.employeeName?.trim() || "Unknown employee";
  const customer = context.customerName?.trim() || "Unknown customer";
  const roleInstruction = outboundVoicemail
    ? "This was an outbound call where the company employee reached the customer's voicemail. The automated greeting is not a customer speaking, and the person speaking after that greeting is the company employee leaving a message. State that the employee left a voicemail, do not describe the employee as the customer/caller seeking service, and do not invent a customer objection or a failure by the company to follow up."
    : context.direction === "OUTBOUND"
      ? "This was initiated by the company employee to the customer. Do not swap their roles. Only describe a customer response or objection if the transcript actually contains one."
      : "This was initiated by the customer to the company. Distinguish the customer from the company employee using the metadata and conversation context.";

  return [
    "Summarize this call transcript as JSON.",
    "",
    "TRUSTED CALL METADATA (this overrides any ambiguous wording in the transcript):",
    "- Direction: " + context.direction,
    "- Company employee: " + employee,
    "- Customer: " + customer,
    "- Automated voicemail greeting detected: " + (outboundVoicemail ? "YES" : "NO"),
    "",
    roleInstruction,
    "",
    "Transcript:",
    transcript.trim().slice(0, 12000),
  ].join("\n");
}

export function callSummaryForDisplay(params: {
  transcript?: string | null;
  direction: CallSummaryContext["direction"];
  aiSummary?: string | null;
  employeeName?: string | null;
  customerName?: string | null;
}): string | null {
  const summary = params.aiSummary?.trim() || null;
  if (
    !isLikelyOutboundVoicemailTranscript(params.transcript ?? "", params.direction) ||
    !summary ||
    /\b(?:voicemail|voice message|left (?:a )?message)\b/i.test(summary)
  ) {
    return summary;
  }

  const employee = params.employeeName?.trim() || "A team member";
  const customer = params.customerName?.trim();
  return `${employee} placed an outbound call${customer ? ` to ${customer}` : ""} and left a voicemail. The customer did not participate in the recorded conversation. Review the transcript for the message details.`;
}
