import { createHash, randomBytes } from "node:crypto";
import { UserRole } from "@prisma/client";
import { getAppBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";

const AFFILIATE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashAffiliateToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAffiliateSignInLink(userId: string, requestOrigin?: string | null) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      role: UserRole.AFFILIATE,
      status: "ACTIVE",
      systemKind: null,
    },
    select: { id: true },
  });
  if (!user) throw new Error("Active affiliate account not found");

  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AFFILIATE_LINK_TTL_MS);

  await prisma.$transaction([
    prisma.affiliateSignInToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.affiliateSignInToken.create({
      data: {
        userId,
        tokenHash: hashAffiliateToken(rawToken),
        expiresAt,
      },
    }),
  ]);

  const url = new URL("/affiliate/sign-in", getAppBaseUrl(requestOrigin));
  url.searchParams.set("token", rawToken);
  return { url: url.toString(), expiresAt };
}

export async function consumeAffiliateSignInToken(rawToken: string) {
  if (!rawToken || rawToken.length > 256) return null;
  const tokenHash = hashAffiliateToken(rawToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const record = await tx.affiliateSignInToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            companyId: true,
            role: true,
            status: true,
            systemKind: true,
          },
        },
      },
    });

    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= now ||
      record.user.role !== UserRole.AFFILIATE ||
      record.user.status !== "ACTIVE" ||
      record.user.systemKind
    ) {
      return null;
    }

    const consumed = await tx.affiliateSignInToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return null;

    return record.user;
  });
}
