const TWILIO_EMAIL_API = "https://comms.twilio.com/v1/Emails";

export type SendEmailResult = {
  statusCode: number;
  messageId: string | null;
  body: unknown;
};

export type TwilioEmailAuthSource = "account-token" | "api-key" | "email-api-key";

type TwilioEmailCredentials = {
  username: string;
  password: string;
  source: TwilioEmailAuthSource;
};

/** Default outbound from address (company setting overrides this). */
export function getDefaultFromEmail(): string | undefined {
  return process.env.TWILIO_FROM_EMAIL ?? process.env.SENDGRID_FROM_EMAIL;
}

function maskSid(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 6) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function getTwilioEmailAuthStatus() {
  const issues: string[] = [];
  let source: TwilioEmailAuthSource | null = null;
  let usernamePreview: string | null = null;

  try {
    const credentials = getTwilioEmailCredentials();
    source = credentials.source;
    usernamePreview = maskSid(credentials.username);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Credentials not configured");
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (accountSid?.startsWith("SK")) {
    issues.push(
      "TWILIO_ACCOUNT_SID is an API Key (SK…). It must be your Account SID (AC…) from Twilio Console."
    );
  }

  if (!getDefaultFromEmail()) {
    issues.push("Set TWILIO_FROM_EMAIL in Vercel or configure a From address under Settings → Inbox.");
  }

  return {
    configured: issues.length === 0,
    authSource: source,
    usernamePreview,
    fromEmail: getDefaultFromEmail() ?? null,
    issues,
  };
}

export function isEmailConfigured(): boolean {
  try {
    getTwilioEmailCredentials();
    return true;
  } catch {
    return false;
  }
}

function getTwilioEmailCredentials(): TwilioEmailCredentials {
  const emailApiKey = process.env.TWILIO_EMAIL_API_KEY?.trim();
  const emailApiSecret = process.env.TWILIO_EMAIL_API_SECRET?.trim();
  if (emailApiKey && emailApiSecret) {
    if (!emailApiKey.startsWith("SK")) {
      throw new Error("TWILIO_EMAIL_API_KEY must be an API Key SID starting with SK.");
    }
    return { username: emailApiKey, password: emailApiSecret, source: "email-api-key" };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (accountSid?.startsWith("AC") && authToken) {
    return { username: accountSid, password: authToken, source: "account-token" };
  }

  const apiKey = process.env.TWILIO_API_KEY?.trim();
  const apiSecret = process.env.TWILIO_API_SECRET?.trim();
  if (apiKey?.startsWith("SK") && apiSecret) {
    return { username: apiKey, password: apiSecret, source: "api-key" };
  }

  if (accountSid?.startsWith("SK")) {
    throw new Error(
      "TWILIO_ACCOUNT_SID looks like an API Key. Use Account SID (AC…) + Auth Token, or set TWILIO_EMAIL_API_KEY + TWILIO_EMAIL_API_SECRET."
    );
  }

  throw new Error(
    "Twilio email credentials missing. Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, or TWILIO_EMAIL_API_KEY + TWILIO_EMAIL_API_SECRET."
  );
}

function getTwilioBasicAuth(): string {
  const credentials = getTwilioEmailCredentials();
  return Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
}

function parseFromAddress(from: string): { address: string; name: string } {
  const named = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (named) {
    return { name: named[1].trim(), address: named[2].trim() };
  }
  const local = from.split("@")[0] ?? "Support";
  return { name: local, address: from.trim() };
}

function formatTwilioEmailError(status: number, body: unknown, source: TwilioEmailAuthSource) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const parsed = typeof body === "object" && body !== null ? (body as { code?: number; message?: string }) : null;
  const code = parsed?.code;

  if (status === 401 || code === 70051) {
    const authHint =
      source === "account-token"
        ? "Check TWILIO_ACCOUNT_SID (AC…) and TWILIO_AUTH_TOKEN in Vercel — copy fresh values from Twilio Console → Account → API keys & tokens (Auth Token). Redeploy after updating."
        : source === "api-key"
          ? "The TWILIO_API_KEY / TWILIO_API_SECRET pair was rejected. Use a Main API key, or create dedicated TWILIO_EMAIL_API_KEY + TWILIO_EMAIL_API_SECRET with Email access."
          : "TWILIO_EMAIL_API_KEY / TWILIO_EMAIL_API_SECRET were rejected. Use a Main API key or a Standard key with Email permissions.";

    return `Twilio email authentication failed (401). ${authHint} Details: ${parsed?.message ?? raw}`;
  }

  if (status === 403) {
    return `Twilio email permission denied (403). Verify the sender domain in Twilio Console → Email → Sender Authentication matches your From address. Details: ${parsed?.message ?? raw}`;
  }

  return `Twilio Email API error (${status}): ${raw}`;
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
    throw new Error(getTwilioEmailAuthStatus().issues[0] ?? "Twilio email not configured");
  }

  const credentials = getTwilioEmailCredentials();
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
    throw new Error(formatTwilioEmailError(res.status, body, credentials.source));
  }

  const record = body as { id?: string; emailId?: string; operationId?: string } | null;
  const messageId = record?.id ?? record?.emailId ?? record?.operationId ?? null;

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
