import { SignJWT, jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/auth-secret";

const ACTION_TTL = "10m";
export const PHONE_RELEASE_PURPOSE = "phone-number-release";
export const PHONE_ASSIGNMENT_PURPOSE = "phone-assignment-unlock";

function secretKey() {
  return new TextEncoder().encode(getAuthSecret());
}

export async function issuePhoneStepUpToken(params: {
  userId: string;
  companyId: string;
  challengeId: string;
  purpose: typeof PHONE_RELEASE_PURPOSE | typeof PHONE_ASSIGNMENT_PURPOSE;
}) {
  return new SignJWT({
    purpose: params.purpose,
    companyId: params.companyId,
    challengeId: params.challengeId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime(ACTION_TTL)
    .sign(secretKey());
}

export async function verifyPhoneStepUpToken(
  token: string,
  expected: {
    userId: string;
    companyId: string;
    purpose: typeof PHONE_RELEASE_PURPOSE | typeof PHONE_ASSIGNMENT_PURPOSE;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== expected.purpose) {
      return { ok: false, error: "Invalid MFA token" };
    }
    if (payload.sub !== expected.userId) {
      return { ok: false, error: "MFA token user mismatch" };
    }
    if (payload.companyId !== expected.companyId) {
      return { ok: false, error: "MFA token company mismatch" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "MFA verification expired. Please verify again." };
  }
}

/** Short-lived token proving ADMIN completed step-up MFA for releasing phone numbers. */
export async function issuePhoneReleaseActionToken(params: {
  userId: string;
  companyId: string;
  challengeId: string;
}) {
  return issuePhoneStepUpToken({ ...params, purpose: PHONE_RELEASE_PURPOSE });
}

export async function verifyPhoneReleaseActionToken(
  token: string,
  expected: { userId: string; companyId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  return verifyPhoneStepUpToken(token, { ...expected, purpose: PHONE_RELEASE_PURPOSE });
}
