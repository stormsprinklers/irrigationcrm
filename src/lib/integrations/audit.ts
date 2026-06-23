import { createHash } from "crypto";
import type { IntegrationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function hashPayload(payload: unknown): string {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return createHash("sha256").update(body).digest("hex").slice(0, 32);
}

export async function logIntegrationAudit(params: {
  companyId: string;
  integrationType?: IntegrationType;
  action: string;
  payload?: unknown;
  status: "success" | "error";
  error?: string;
}) {
  try {
    await prisma.integrationAuditLog.create({
      data: {
        companyId: params.companyId,
        integrationType: params.integrationType ?? null,
        action: params.action,
        payloadHash: params.payload != null ? hashPayload(params.payload) : null,
        status: params.status,
        error: params.error ?? null,
      },
    });
  } catch {
    // audit failures must not break integration handlers
  }
}
