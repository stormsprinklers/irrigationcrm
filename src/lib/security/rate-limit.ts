import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthSecret } from "@/lib/auth-secret";
import { prisma } from "@/lib/prisma";

export type AuthRateLimitKind =
  | "password-login"
  | "mfa-verify"
  | "mfa-resend"
  | "password-reset-request"
  | "password-reset-complete"
  | "portal-login-link";

export type RateLimitRule = {
  windowMs: number;
  blockMs: number;
  subjectLimit: number;
  ipLimit: number;
};

const MINUTE = 60_000;
const RULES: Record<AuthRateLimitKind, RateLimitRule> = {
  "password-login": { windowMs: 15 * MINUTE, blockMs: 15 * MINUTE, subjectLimit: 8, ipLimit: 30 },
  "mfa-verify": { windowMs: 10 * MINUTE, blockMs: 15 * MINUTE, subjectLimit: 8, ipLimit: 40 },
  "mfa-resend": { windowMs: 15 * MINUTE, blockMs: 30 * MINUTE, subjectLimit: 3, ipLimit: 15 },
  "password-reset-request": { windowMs: 60 * MINUTE, blockMs: 60 * MINUTE, subjectLimit: 5, ipLimit: 20 },
  "password-reset-complete": { windowMs: 15 * MINUTE, blockMs: 30 * MINUTE, subjectLimit: 6, ipLimit: 20 },
  "portal-login-link": { windowMs: 60 * MINUTE, blockMs: 60 * MINUTE, subjectLimit: 5, ipLimit: 20 },
};

type RateLimitRow = {
  count: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
};

function firstForwardedAddress(value: string | null): string {
  return value?.split(",")[0]?.trim() || "unknown";
}

export function requestClientAddress(request: Request): string {
  return firstForwardedAddress(
    request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip")
  );
}

export function buildRateLimitKey(scope: string, value: string): string {
  const secret =
    process.env.RATE_LIMIT_PEPPER?.trim() || getAuthSecret()?.trim() || "local-development";
  return createHash("sha256")
    .update(`${secret}\0${scope}\0${value.trim().toLowerCase()}`)
    .digest("hex");
}

export async function consumeSecurityRateLimit(
  scope: string,
  value: string,
  limit: number,
  rule: Pick<RateLimitRule, "windowMs" | "blockMs">
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - rule.windowMs);
  const nextBlock = new Date(now.getTime() + rule.blockMs);
  const key = buildRateLimitKey(scope, value);

  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "SecurityRateLimitBucket"
      ("key", "count", "windowStartedAt", "blockedUntil", "updatedAt")
    VALUES
      (${key}, 1, ${now}, NULL, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "SecurityRateLimitBucket"."windowStartedAt" <= ${cutoff} THEN 1
        ELSE "SecurityRateLimitBucket"."count" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "SecurityRateLimitBucket"."windowStartedAt" <= ${cutoff} THEN ${now}
        ELSE "SecurityRateLimitBucket"."windowStartedAt"
      END,
      "blockedUntil" = CASE
        WHEN "SecurityRateLimitBucket"."blockedUntil" > ${now}
          THEN "SecurityRateLimitBucket"."blockedUntil"
        WHEN "SecurityRateLimitBucket"."windowStartedAt" <= ${cutoff} THEN NULL
        WHEN "SecurityRateLimitBucket"."count" + 1 > ${limit} THEN ${nextBlock}
        ELSE NULL
      END,
      "updatedAt" = ${now}
    RETURNING "count", "windowStartedAt", "blockedUntil"
  `;

  const row = rows[0];
  if (!row) return { allowed: false, retryAfterSeconds: 60 };
  const blockedUntil = row.blockedUntil?.getTime() ?? 0;
  const allowed = row.count <= limit && blockedUntil <= now.getTime();
  const resetAt = blockedUntil || row.windowStartedAt.getTime() + rule.windowMs;
  return {
    allowed,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

function limitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Try again later.", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    }
  );
}

/**
 * Enforce both an identity bucket and a source-address bucket using PostgreSQL,
 * so limits are shared across serverless instances. Storage failures deny the
 * abuse-sensitive request instead of silently disabling protection.
 */
export async function enforceAuthRateLimit(
  request: Request,
  kind: AuthRateLimitKind,
  subject: string
): Promise<NextResponse | null> {
  const rule = RULES[kind];
  try {
    const subjectResult = await consumeSecurityRateLimit(`${kind}:subject`, subject || "missing", rule.subjectLimit, rule);
    if (!subjectResult.allowed) return limitedResponse(subjectResult.retryAfterSeconds);

    const addressResult = await consumeSecurityRateLimit(
      `${kind}:ip`,
      requestClientAddress(request),
      rule.ipLimit,
      rule
    );
    if (!addressResult.allowed) return limitedResponse(addressResult.retryAfterSeconds);
    return null;
  } catch (error) {
    console.error("[security] rate-limit storage unavailable", { kind, error });
    return NextResponse.json(
      { error: "Authentication protection is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
