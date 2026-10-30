import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCronRequest } from "@/lib/security/trusted-request";

function auditRetentionDays() {
  const parsed = Number(process.env.SECURITY_AUDIT_RETENTION_DAYS ?? "365");
  return Number.isFinite(parsed) ? Math.min(2555, Math.max(90, Math.floor(parsed))) : 365;
}

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const now = new Date();
  const staleRateLimit = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const staleAudit = new Date(
    now.getTime() - auditRetentionDays() * 24 * 60 * 60 * 1000
  );

  const [oauth, webhooks, affiliateLinks, rateLimits, audit] = await prisma.$transaction([
    prisma.oAuthStateNonce.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.webhookEventReceipt.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.affiliateSignInToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.securityRateLimitBucket.deleteMany({ where: { updatedAt: { lt: staleRateLimit } } }),
    prisma.securityAuditEvent.deleteMany({ where: { createdAt: { lt: staleAudit } } }),
  ]);

  return NextResponse.json({
    ok: true,
    removed: {
      oauthStates: oauth.count,
      webhookReceipts: webhooks.count,
      affiliateSignInLinks: affiliateLinks.count,
      rateLimitBuckets: rateLimits.count,
      auditEvents: audit.count,
    },
  });
}
