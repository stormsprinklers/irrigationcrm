import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getAuthSecret } from "@/lib/auth-secret";
import { prisma } from "@/lib/prisma";
import { requestClientAddress } from "@/lib/security/rate-limit";

const SENSITIVE_METADATA_KEY = /(authorization|cookie|password|secret|token|code|body|content)/i;

export type SecurityAuditMetadata = Record<string, string | number | boolean | null | undefined>;

function auditHash(scope: string, value: string) {
  const pepper = process.env.RATE_LIMIT_PEPPER?.trim() || getAuthSecret()?.trim() || "local-development";
  return createHash("sha256")
    .update(`${pepper}\0${scope}\0${value.trim().toLowerCase()}`)
    .digest("hex");
}

export function sanitizeSecurityMetadata(metadata?: SecurityAuditMetadata) {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => value !== undefined && !SENSITIVE_METADATA_KEY.test(key))
      .slice(0, 20)
      .map(([key, value]) => [key.slice(0, 64), typeof value === "string" ? value.slice(0, 255) : value])
  );
}

export async function writeSecurityAuditEvent(params: {
  event: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED" | "CHALLENGE";
  request?: Request;
  companyId?: string | null;
  actorId?: string | null;
  audience?: string | null;
  subject?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: SecurityAuditMetadata;
}) {
  try {
    const metadata = sanitizeSecurityMetadata(params.metadata);
    await prisma.securityAuditEvent.create({
      data: {
        event: params.event.slice(0, 100),
        outcome: params.outcome,
        companyId: params.companyId ?? null,
        actorId: params.actorId ?? null,
        audience: params.audience?.slice(0, 50) ?? null,
        subjectHash: params.subject ? auditHash("subject", params.subject) : null,
        ipHash: params.request
          ? auditHash("ip", requestClientAddress(params.request))
          : null,
        resourceType: params.resourceType?.slice(0, 100) ?? null,
        resourceId: params.resourceId?.slice(0, 255) ?? null,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error("[security-audit] failed to write event", {
      event: params.event,
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
