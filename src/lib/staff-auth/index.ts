import { createHash, randomInt, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { AuthMfaPurpose, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthSecret } from "@/lib/auth-secret";
import { sendSms } from "@/lib/inbox/twilio";
import { normalizePhone } from "@/lib/inbox/phone";
import { getDefaultFromEmail, sendEmail } from "@/lib/inbox/email";
import { getAppBaseUrl } from "@/lib/app-url";
import { buildResetPasswordPath } from "@/lib/staff-auth/return-to";
import { getCompanyCallerId } from "@/lib/voice/company-phone";

const MFA_TTL_MS = 10 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;
const RESET_TTL_MS = 60 * 60 * 1000;
const TICKET_TTL = "3m";

export type StaffAuthUser = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "companyId"
  | "role"
  | "status"
  | "passwordHash"
  | "phone"
  | "lmsUserId"
  | "appleDemoAccount"
>;

function hashOpaque(value: string) {
  return createHash("sha256")
    .update(`${getAuthSecret()}:${value}`)
    .digest("hex");
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `•••-•••-${digits.slice(-4)}`;
}

/** Normalize employee phone to E.164 (US +1), same as inbox SMS. */
export function normalizeStaffPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const normalized = normalizePhone(phone.trim());
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return normalized.startsWith("+") ? normalized : `+${digits}`;
}

async function resolveSmsFromNumber(companyId: string): Promise<string | null> {
  // Prefer the same numbers the inbox/voice stack already uses successfully.
  // (Do not prefer TWILIO_PHONE_NUMBER first — a stale env value breaks MFA
  // while inbox SMS still works via company.twilioPhone.)
  const companyNumber = await getCompanyCallerId(companyId);
  if (companyNumber) return companyNumber;
  const env = process.env.TWILIO_PHONE_NUMBER?.trim();
  return env ? normalizePhone(env) : null;
}

function twilioSendErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") {
    return "Failed to send verification text. Try again or contact an admin.";
  }
  const twilioErr = err as { code?: number | string; message?: string };
  const code = twilioErr.code != null ? String(twilioErr.code) : "";
  const detail = twilioErr.message?.trim();

  if (code === "20003" || code === "20001") {
    return "Twilio credentials are invalid. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.";
  }
  if (code === "21211" || code === "21401") {
    return "Your employee phone number is invalid. Ask an admin to update it in your profile.";
  }
  if (code === "21608" || code === "21610") {
    return "This phone cannot receive SMS from Twilio yet (trial or blocked). Verify the number in Twilio Console or use a production Twilio account.";
  }
  if (code === "21606" || code === "21612") {
    return "The company Twilio number cannot send SMS. Check Phone numbers / Messaging in Twilio.";
  }
  if (
    detail?.toLowerCase().includes("credential") ||
    detail?.toLowerCase().includes("authenticate")
  ) {
    return "Twilio credentials are not configured correctly.";
  }
  if (detail) {
    return `Failed to send verification text (${code || "error"}): ${detail}`;
  }
  return "Failed to send verification text. Try again or contact an admin.";
}

export async function findActiveStaffByEmail(email: string): Promise<StaffAuthUser | null> {
  const normalized = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      email: true,
      name: true,
      companyId: true,
      role: true,
      status: true,
      passwordHash: true,
      phone: true,
      lmsUserId: true,
      appleDemoAccount: true,
    },
  });
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) return null;
  return user;
}

export async function verifyStaffPassword(user: StaffAuthUser, password: string) {
  if (!user.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export type StartMfaResult =
  | {
      ok: true;
      challengeId: string;
      phoneMasked: string;
      /** Only when STAFF_AUTH_EXPOSE_OTP=true (local/dev). */
      debugCode?: string;
    }
  | { ok: false; error: string; code: "NO_PHONE" | "SMS_CONFIG" | "INVALID" };

export async function startStaffMfaChallenge(
  user: StaffAuthUser,
  purpose: AuthMfaPurpose,
): Promise<StartMfaResult> {
  const phone = normalizeStaffPhone(user.phone);
  if (!phone) {
    return {
      ok: false,
      error:
        "Two-factor authentication is required. Ask an admin to add a mobile phone number to your employee profile.",
      code: "NO_PHONE",
    };
  }

  const from = await resolveSmsFromNumber(user.companyId);
  if (!from && process.env.STAFF_AUTH_EXPOSE_OTP !== "true") {
    return {
      ok: false,
      error:
        "SMS two-factor authentication is not configured. Set a company Twilio phone (Settings → Phone numbers) or TWILIO_PHONE_NUMBER.",
      code: "SMS_CONFIG",
    };
  }

  const code = String(randomInt(100000, 999999));
  const challenge = await prisma.authMfaChallenge.create({
    data: {
      userId: user.id,
      purpose,
      codeHash: hashOpaque(code),
      phoneMasked: maskPhone(phone),
      expiresAt: new Date(Date.now() + MFA_TTL_MS),
    },
  });

  if (from) {
    try {
      await sendSms({
        companyId: user.companyId,
        from,
        to: phone,
        body:
          purpose === "EXPENSE_CARD_ADMIN"
            ? `Storm Sprinklers expense card verification code: ${code}. Expires in 10 minutes.`
            : `Storm Sprinklers login code: ${code}. Expires in 10 minutes.`,
        bypassCommsFreeze: true,
      });
    } catch (err) {
      console.error("[staff-auth] SMS send failed", { from, to: phone, err });
      if (process.env.STAFF_AUTH_EXPOSE_OTP !== "true") {
        return {
          ok: false,
          error: twilioSendErrorMessage(err),
          code: "SMS_CONFIG",
        };
      }
    }
  } else {
    console.warn(`[staff-auth] OTP for ${user.email} (no Twilio from): ${code}`);
  }

  return {
    ok: true,
    challengeId: challenge.id,
    phoneMasked: challenge.phoneMasked,
    ...(process.env.STAFF_AUTH_EXPOSE_OTP === "true" ? { debugCode: code } : {}),
  };
}

export type VerifyMfaResult =
  | { ok: true; user: StaffAuthUser; challengeId: string }
  | { ok: false; error: string };

export async function verifyStaffMfaChallenge(
  challengeId: string,
  code: string,
  purpose: AuthMfaPurpose,
): Promise<VerifyMfaResult> {
  const challenge = await prisma.authMfaChallenge.findUnique({
    where: { id: challengeId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          companyId: true,
          role: true,
          status: true,
          passwordHash: true,
          phone: true,
          lmsUserId: true,
          appleDemoAccount: true,
        },
      },
    },
  });

  if (!challenge || challenge.purpose !== purpose) {
    return { ok: false, error: "Invalid or expired verification code." };
  }
  if (challenge.consumedAt || challenge.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Verification code expired. Sign in again." };
  }
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Sign in again." };
  }
  if (challenge.user.status !== "ACTIVE") {
    return { ok: false, error: "Account is not active." };
  }

  const match = hashOpaque(String(code).trim()) === challenge.codeHash;
  if (!match) {
    await prisma.authMfaChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "Invalid verification code." };
  }

  await prisma.authMfaChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: new Date(), consumedAt: new Date() },
  });

  return { ok: true, user: challenge.user, challengeId: challenge.id };
}

export type BeginStaffLoginResult =
  | {
      ok: true;
      mfaRequired: false;
      user: StaffAuthUser;
    }
  | {
      ok: true;
      mfaRequired: true;
      challengeId: string;
      phoneMasked: string;
      debugCode?: string;
    }
  | { ok: false; error: string; code: "NO_PHONE" | "SMS_CONFIG" | "INVALID" };

export async function beginStaffPasswordLogin(
  email: string,
  password: string,
  purpose: AuthMfaPurpose,
): Promise<BeginStaffLoginResult> {
  const user = await findActiveStaffByEmail(email);
  if (!user || !(await verifyStaffPassword(user, password))) {
    return { ok: false, error: "Invalid email or password.", code: "INVALID" };
  }

  // App Store review / Apple demo technician — password only, no SMS MFA.
  if (user.appleDemoAccount) {
    return { ok: true, mfaRequired: false, user };
  }

  const mfa = await startStaffMfaChallenge(user, purpose);
  if (!mfa.ok) return mfa;
  return {
    ok: true,
    mfaRequired: true,
    challengeId: mfa.challengeId,
    phoneMasked: mfa.phoneMasked,
    ...(mfa.debugCode ? { debugCode: mfa.debugCode } : {}),
  };
}

function ticketSecret() {
  const shared =
    process.env.STAFF_AUTH_TICKET_SECRET?.trim() ||
    process.env.LMS_INTEGRATION_KEY?.trim() ||
    getAuthSecret();
  return new TextEncoder().encode(shared);
}

/** Short-lived ticket so LMS can create a session after CRM MFA. */
export async function issueLmsAuthTicket(user: StaffAuthUser) {
  return new SignJWT({
    email: user.email,
    crmUserId: user.id,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(TICKET_TTL)
    .setAudience("lms-staff-auth")
    .sign(ticketSecret());
}

export async function verifyLmsAuthTicket(ticket: string) {
  const { payload } = await jwtVerify(ticket, ticketSecret(), {
    audience: "lms-staff-auth",
  });
  const crmUserId = String(payload.sub ?? "");
  const email = String(payload.email ?? "").toLowerCase();
  if (!crmUserId || !email) throw new Error("Invalid ticket");
  return {
    crmUserId,
    email,
    name: payload.name ? String(payload.name) : null,
    role: payload.role ? String(payload.role) : "EMPLOYEE",
  };
}

export async function requestPasswordReset(email: string, returnTo?: string | null) {
  const user = await findActiveStaffByEmail(email);
  // Always return success wording to avoid account enumeration.
  if (!user) return { ok: true as const };

  const raw = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaque(raw),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  const base = getAppBaseUrl();
  const resetUrl = `${base}${buildResetPasswordPath(raw, returnTo)}`;
  const from = getDefaultFromEmail();
  if (!from) {
    console.error("[staff-auth] password reset: TWILIO_FROM_EMAIL not set");
    if (process.env.STAFF_AUTH_EXPOSE_OTP === "true") {
      console.warn(`[staff-auth] reset link for ${user.email}: ${resetUrl}`);
    }
    return { ok: true as const };
  }

  await sendEmail({
    from,
    to: [user.email],
    subject: "Reset your Storm Sprinklers password",
    text: `Reset your password using this link (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: `<p>Reset your Storm Sprinklers staff password using the link below. It expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });

  return { ok: true as const };
}

export async function resetStaffPassword(rawToken: string, newPassword: string) {
  if (newPassword.length < 8) {
    return { ok: false as const, error: "Password must be at least 8 characters." };
  }

  const tokenHash = hashOpaque(rawToken.trim());
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "This reset link is invalid or has expired." };
  }
  if (row.user.status !== "ACTIVE") {
    return { ok: false as const, error: "Account is not active." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true as const };
}
