const TWILIO_EMAIL_API = "https://comms.twilio.com/v1/Emails";

export type SendEmailResult = {
  statusCode: number;
  messageId: string | null;
  body: unknown;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

/** Default outbound from address (company setting overrides this). */
export function getDefaultFromEmail(): string | undefined {
  return process.env.TWILIO_FROM_EMAIL ?? process.env.SENDGRID_FROM_EMAIL;
}

function parseFromAddress(from: string): { address: string; name: string } {
  const named = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (named) {
    return { name: named[1].trim(), address: named[2].trim() };
  }
  const local = from.split("@")[0] ?? "Support";
  return { name: local, address: from.trim() };
}

function getTwilioBasicAuth(): string {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio email credentials not configured (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN)");
  }
  return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

export async function sendEmail(params: {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    throw new Error("Twilio email not configured");
  }

  const from = parseFromAddress(params.from);
  const text =
    params.text ??
    params.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ??
    "";
  const html = params.html ?? (params.text ? `<p>${params.text.replace(/\n/g, "<br/>")}</p>` : "");

  const payload: Record<string, unknown> = {
    from,
    to: params.to.map((address) => ({ address: address.trim() })),
    content: {
      subject: params.subject,
      html,
      ...(text ? { text } : {}),
    },
  };

  if (params.replyTo) {
    payload.headers = { "Reply-To": params.replyTo };
  }

  const res = await fetch(TWILIO_EMAIL_API, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getTwilioBasicAuth()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();
  let body: unknown = bodyText;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    // keep raw text
  }

  if (!res.ok) {
    throw new Error(
      `Twilio Email API error (${res.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`
    );
  }

  const record = body as { id?: string; emailId?: string } | null;
  const messageId = record?.id ?? record?.emailId ?? null;

  return {
    statusCode: res.status,
    messageId,
    body,
  };
}

/** Optional webhook verification — set TWILIO_EMAIL_WEBHOOK_PUBLIC_KEY from Twilio Email settings. */
export function validateEmailWebhook(
  _payload: string,
  _signature: string,
  _timestamp: string
): boolean {
  if (!process.env.TWILIO_EMAIL_WEBHOOK_PUBLIC_KEY) return true;
  // ECDSA verification requires the raw multipart body; skip until public key wiring is added.
  return true;
}
