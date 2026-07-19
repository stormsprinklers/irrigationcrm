import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Division, EmployeeStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEMO_PASSWORD_LENGTH = 14;

export function appleDemoEmailForCompany(companyId: string) {
  const slug = companyId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase() || "storm";
  return `apple.demo.${slug}@stormsprinklers.com`;
}

export function generateAppleDemoPassword() {
  // Readable for App Review notes; exclude ambiguous characters.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = randomBytes(DEMO_PASSWORD_LENGTH);
  let out = "";
  for (let i = 0; i < DEMO_PASSWORD_LENGTH; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export async function getAppleDemoAccount(companyId: string) {
  return prisma.user.findFirst({
    where: { companyId, appleDemoAccount: true },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      appleDemoAccount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createAppleDemoAccount(companyId: string): Promise<
  | { user: NonNullable<Awaited<ReturnType<typeof getAppleDemoAccount>>>; plainPassword: string }
  | { error: string; existing?: NonNullable<Awaited<ReturnType<typeof getAppleDemoAccount>>> }
> {
  const existing = await getAppleDemoAccount(companyId);
  if (existing) {
    return { error: "An Apple demo account already exists for this company.", existing };
  }

  const email = appleDemoEmailForCompany(companyId);
  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) {
    return { error: "Demo email is already in use. Contact support." };
  }

  const plainPassword = generateAppleDemoPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const user = await prisma.user.create({
    data: {
      companyId,
      firstName: "Apple",
      lastName: "Demo",
      name: "Apple Demo",
      email,
      phone: null,
      role: UserRole.TECH,
      title: "App Store review technician",
      status: EmployeeStatus.ACTIVE,
      division: Division.SERVICE,
      color: "#EC4899",
      tags: ["apple-demo"],
      appleDemoAccount: true,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      appleDemoAccount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { user, plainPassword };
}

export async function setAppleDemoAccountEnabled(companyId: string, enabled: boolean) {
  const account = await getAppleDemoAccount(companyId);
  if (!account) {
    return { error: "No Apple demo account found. Create one first." as const };
  }

  const user = await prisma.user.update({
    where: { id: account.id },
    data: {
      status: enabled ? EmployeeStatus.ACTIVE : EmployeeStatus.ARCHIVED,
      // Keep flag true so we can re-enable the same account later.
      appleDemoAccount: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      appleDemoAccount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { user };
}

export async function resetAppleDemoPassword(companyId: string) {
  const account = await getAppleDemoAccount(companyId);
  if (!account) {
    return { error: "No Apple demo account found. Create one first." as const };
  }

  const plainPassword = generateAppleDemoPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const user = await prisma.user.update({
    where: { id: account.id },
    data: {
      passwordHash,
      status: EmployeeStatus.ACTIVE,
      appleDemoAccount: true,
      phone: null,
      role: UserRole.TECH,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      appleDemoAccount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { user, plainPassword };
}
