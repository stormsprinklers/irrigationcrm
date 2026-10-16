import { jwtVerify, SignJWT } from "jose";
import { getAuthSecret } from "@/lib/auth-secret";

export const OWNER_ASSISTANT_SETTINGS_PURPOSE = "owner-assistant-settings";

function key() {
  return new TextEncoder().encode(getAuthSecret());
}

export async function issueOwnerAssistantStepUpToken(params: {
  userId: string;
  companyId: string;
  challengeId: string;
}) {
  return new SignJWT({
    purpose: OWNER_ASSISTANT_SETTINGS_PURPOSE,
    companyId: params.companyId,
    challengeId: params.challengeId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key());
}

export async function verifyOwnerAssistantStepUpToken(
  token: string,
  expected: { userId: string; companyId: string }
) {
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.purpose === OWNER_ASSISTANT_SETTINGS_PURPOSE &&
      payload.sub === expected.userId && payload.companyId === expected.companyId
      ? { ok: true as const }
      : { ok: false as const, error: "Invalid MFA token" };
  } catch {
    return { ok: false as const, error: "MFA verification expired. Please verify again." };
  }
}
