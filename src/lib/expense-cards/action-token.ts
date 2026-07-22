import { SignJWT, jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/auth-secret";

const ACTION_TTL = "10m";
const PURPOSE = "expense-card-admin";

function secretKey() {
  return new TextEncoder().encode(getAuthSecret());
}

/** Short-lived token proving ADMIN completed step-up MFA for expense-card mutations. */
export async function issueExpenseCardActionToken(params: {
  userId: string;
  companyId: string;
  challengeId: string;
}) {
  return new SignJWT({
    purpose: PURPOSE,
    companyId: params.companyId,
    challengeId: params.challengeId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime(ACTION_TTL)
    .sign(secretKey());
}

export async function verifyExpenseCardActionToken(
  token: string,
  expected: { userId: string; companyId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== PURPOSE) {
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
