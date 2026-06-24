import { createHmac, timingSafeEqual } from "crypto";
import { getAppBaseUrl } from "@/lib/app-url";

function mediaSigningSecret() {
  return (
    process.env.TWILIO_AUTH_TOKEN ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET
  );
}

export function signMediaPath(pathname: string, expires: number) {
  const secret = mediaSigningSecret();
  if (!secret) throw new Error("Media signing secret not configured");
  return createHmac("sha256", secret).update(`${pathname}:${expires}`).digest("hex");
}

export function verifyMediaSignature(pathname: string, expires: number, signature: string) {
  const secret = mediaSigningSecret();
  if (!secret) return false;
  if (expires < Math.floor(Date.now() / 1000)) return false;

  const expected = signMediaPath(pathname, expires);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Twilio-accessible URL for a private blob (MMS outbound). */
export function twilioAccessibleMediaUrl(pathname: string, ttlSeconds = 3600) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signMediaPath(pathname, expires);
  const base = getAppBaseUrl();
  return `${base}/api/twilio/mms/media?pathname=${encodeURIComponent(pathname)}&expires=${expires}&sig=${sig}`;
}

export function pathnameFromBlobUrl(blobUrl: string) {
  try {
    return new URL(blobUrl).pathname.replace(/^\/+/, "");
  } catch {
    return blobUrl.replace(/^\/+/, "");
  }
}
