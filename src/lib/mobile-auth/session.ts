import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { canAccessMobileApp } from "@/lib/employees";
import {
  generateRefreshToken,
  getRefreshTokenExpiry,
  hashRefreshToken,
  signMobileAccessToken,
  MOBILE_ACCESS_TOKEN_TTL_SECONDS,
} from "@/lib/mobile-auth/tokens";

export async function authenticateMobileUser(email: string, password: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user?.passwordHash || user.status !== "ACTIVE") {
    return { error: "Invalid email or password" as const };
  }
  if (!canAccessMobileApp(user.role)) {
    return { error: "This app is for Storm CRM staff only" as const };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password" as const };
  }
  return { user };
}

export async function issueMobileSession(params: {
  userId: string;
  companyId: string;
  role: string;
  deviceName?: string;
}) {
  const { rawToken, tokenHash } = generateRefreshToken();
  const expiresAt = getRefreshTokenExpiry();

  await prisma.mobileSession.create({
    data: {
      userId: params.userId,
      companyId: params.companyId,
      deviceName: params.deviceName ?? null,
      refreshTokenHash: tokenHash,
      expiresAt,
      lastUsedAt: new Date(),
    },
  });

  const accessToken = await signMobileAccessToken({
    sub: params.userId,
    companyId: params.companyId,
    role: params.role,
  });

  return {
    accessToken,
    refreshToken: rawToken,
    expiresIn: MOBILE_ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function rotateMobileSession(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const session = await prisma.mobileSession.findFirst({
    where: {
      refreshTokenHash: tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        select: {
          id: true,
          companyId: true,
          role: true,
          status: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!session?.user || session.user.status !== "ACTIVE") {
    return { error: "Invalid refresh token" as const };
  }
  if (!canAccessMobileApp(session.user.role)) {
    return { error: "This app is for technicians and admins only" as const };
  }

  const { rawToken, tokenHash: newHash } = generateRefreshToken();
  const expiresAt = getRefreshTokenExpiry();

  await prisma.$transaction([
    prisma.mobileSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.mobileSession.create({
      data: {
        userId: session.userId,
        companyId: session.companyId,
        deviceName: session.deviceName,
        refreshTokenHash: newHash,
        expiresAt,
        lastUsedAt: new Date(),
      },
    }),
  ]);

  const accessToken = await signMobileAccessToken({
    sub: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role,
  });

  return {
    accessToken,
    refreshToken: rawToken,
    expiresIn: MOBILE_ACCESS_TOKEN_TTL_SECONDS,
    user: session.user,
  };
}

export async function revokeMobileSession(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.mobileSession.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
