import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const PUBLIC_LINK_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export function createPublicCapability() {
  return {
    publicToken: randomBytes(32).toString("base64url"),
    publicTokenExpiresAt: new Date(Date.now() + PUBLIC_LINK_TTL_MS),
    publicTokenRevokedAt: null,
  };
}

export function activePublicCapability(token: string, now = new Date()) {
  return {
    publicToken: token,
    publicTokenRevokedAt: null,
    publicTokenExpiresAt: { gt: now },
  };
}

export function rotatePublicCapability(version: number) {
  return {
    ...createPublicCapability(),
    publicTokenVersion: version + 1,
  };
}

type StoredPublicCapability = {
  id: string;
  publicToken: string;
  publicTokenExpiresAt: Date;
  publicTokenRevokedAt: Date | null;
  publicTokenVersion: number;
};

export function publicCapabilityIsActive(
  capability: Pick<StoredPublicCapability, "publicTokenExpiresAt" | "publicTokenRevokedAt">,
  now = new Date()
) {
  return capability.publicTokenRevokedAt === null && capability.publicTokenExpiresAt > now;
}

export async function ensureInvoicePublicToken(invoice: StoredPublicCapability) {
  if (publicCapabilityIsActive(invoice)) return invoice.publicToken;
  await prisma.invoice.updateMany({
    where: { id: invoice.id, publicTokenVersion: invoice.publicTokenVersion },
    data: rotatePublicCapability(invoice.publicTokenVersion),
  });
  const current = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    select: { publicToken: true },
  });
  if (!current) throw new Error("Invoice no longer exists");
  return current.publicToken;
}

export async function ensureEstimatePublicToken(estimate: StoredPublicCapability) {
  if (publicCapabilityIsActive(estimate)) return estimate.publicToken;
  await prisma.estimate.updateMany({
    where: { id: estimate.id, publicTokenVersion: estimate.publicTokenVersion },
    data: rotatePublicCapability(estimate.publicTokenVersion),
  });
  const current = await prisma.estimate.findUnique({
    where: { id: estimate.id },
    select: { publicToken: true },
  });
  if (!current) throw new Error("Estimate no longer exists");
  return current.publicToken;
}
