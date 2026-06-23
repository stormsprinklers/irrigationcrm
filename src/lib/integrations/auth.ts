import type { IntegrationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractIntegrationKey, hashIntegrationKey } from "./keys";
import { checkIntegrationRateLimit } from "./rate-limit";

export type IntegrationContext = {
  companyId: string;
  credentialId: string;
  type: IntegrationType;
};

export async function authenticateIntegration(
  request: Request,
  expectedType?: IntegrationType
): Promise<IntegrationContext | NextResponse> {
  const rawKey = extractIntegrationKey(request);
  if (!rawKey) {
    return NextResponse.json({ error: "Missing integration key" }, { status: 401 });
  }

  const keyHash = hashIntegrationKey(rawKey);
  const credential = await prisma.integrationCredential.findFirst({
    where: { keyHash, enabled: true },
  });

  if (!credential) {
    return NextResponse.json({ error: "Invalid integration key" }, { status: 401 });
  }

  if (expectedType && credential.type !== expectedType) {
    return NextResponse.json({ error: "Integration key type mismatch" }, { status: 403 });
  }

  if (!checkIntegrationRateLimit(credential.id)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  await prisma.integrationCredential
    .update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return {
    companyId: credential.companyId,
    credentialId: credential.id,
    type: credential.type,
  };
}

export function isIntegrationContext(
  value: IntegrationContext | NextResponse
): value is IntegrationContext {
  return "companyId" in value;
}
