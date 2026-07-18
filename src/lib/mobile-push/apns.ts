import http2 from "http2";
import { importPKCS8, SignJWT } from "jose";

type ApnsAlert = {
  title: string;
  body?: string | null;
};

export type ApnsPayload = {
  alert: ApnsAlert;
  conversationId?: string;
  visitId?: string;
  customerId?: string;
  estimateId?: string;
  type?: string;
  deepLink?: string;
  badge?: number;
};

let cachedJwt: { token: string; expiresAt: number } | null = null;

function apnsHost() {
  return process.env.APNS_USE_SANDBOX === "true"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
}

function apnsBundleId() {
  return process.env.APNS_BUNDLE_ID || "com.stormsprinklers.stormcrm";
}

function apnsConfigured() {
  return Boolean(
    process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_PRIVATE_KEY
  );
}

async function getApnsAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt - 60 > now) {
    return cachedJwt.token;
  }

  const keyId = process.env.APNS_KEY_ID!;
  const teamId = process.env.APNS_TEAM_ID!;
  const privateKeyPem = process.env.APNS_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .sign(privateKey);

  cachedJwt = { token, expiresAt: now + 50 * 60 };
  return token;
}

export async function sendApnsNotification(
  deviceToken: string,
  payload: ApnsPayload
): Promise<{ ok: true } | { ok: false; reason: string; status?: number }> {
  if (!apnsConfigured()) {
    return { ok: false, reason: "APNs not configured" };
  }

  const jwt = await getApnsAuthToken();
  const body = JSON.stringify({
    aps: {
      alert: {
        title: payload.alert.title,
        ...(payload.alert.body ? { body: payload.alert.body } : {}),
      },
      sound: "default",
      ...(payload.badge != null ? { badge: payload.badge } : {}),
      ...(payload.type ? { category: payload.type } : {}),
    },
    ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
    ...(payload.visitId ? { visitId: payload.visitId } : {}),
    ...(payload.customerId ? { customerId: payload.customerId } : {}),
    ...(payload.estimateId ? { estimateId: payload.estimateId } : {}),
    ...(payload.type ? { type: payload.type } : {}),
    ...(payload.deepLink ? { deepLink: payload.deepLink } : {}),
  });

  return new Promise((resolve) => {
    const client = http2.connect(`https://${apnsHost()}`);
    client.on("error", (error) => {
      client.close();
      resolve({ ok: false, reason: error.message });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": apnsBundleId(),
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let responseBody = "";
    req.on("response", (headers) => {
      const status = Number(headers[":status"] ?? 0);
      req.on("data", (chunk) => {
        responseBody += chunk.toString();
      });
      req.on("end", () => {
        client.close();
        if (status === 200) {
          resolve({ ok: true });
          return;
        }
        let reason = `APNs status ${status}`;
        try {
          const parsed = JSON.parse(responseBody) as { reason?: string };
          if (parsed.reason) reason = parsed.reason;
        } catch {
          // ignore parse errors
        }
        resolve({ ok: false, reason, status });
      });
    });

    req.on("error", (error) => {
      client.close();
      resolve({ ok: false, reason: error.message });
    });

    req.end(body);
  });
}

export function isApnsConfigured() {
  return apnsConfigured();
}
