import type { SessionUser } from "@/lib/api-auth";
import { listOperatedVoiceAccounts } from "@/lib/account/operated-accounts";
import { prisma } from "@/lib/prisma";

export async function requireRealAdmin(user: SessionUser) {
  const row = await prisma.user.findFirst({
    where: { id: user.id, companyId: user.companyId, status: "ACTIVE", role: "ADMIN" },
    select: { id: true, companyId: true, email: true, name: true, role: true },
  });
  if (!row) throw new Error("FORBIDDEN");
  return row;
}

export async function listOwnerAssistantCompanies(owner: {
  id: string;
  companyId: string;
  email: string;
}) {
  const operated = await listOperatedVoiceAccounts({
    userId: owner.id,
    companyId: owner.companyId,
    email: owner.email,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: operated.map((account) => account.userId) }, status: "ACTIVE", role: "ADMIN" },
    select: { id: true, companyId: true, company: { select: { timezone: true } } },
  });
  const allowedUsers = new Map(
    users.map((user) => [
      user.companyId,
      { userId: user.id, timezone: user.company.timezone || "America/Denver" },
    ])
  );
  return operated
    .filter((account) => allowedUsers.has(account.companyId))
    .map((account) => ({ ...account, ...allowedUsers.get(account.companyId)! }));
}

export async function resolveOwnerCompanyUser(ownerUserId: string, companyId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { id: true, companyId: true, email: true, status: true, role: true },
  });
  if (!owner || owner.status !== "ACTIVE" || owner.role !== "ADMIN") return null;
  const account = (await listOwnerAssistantCompanies(owner)).find((item) => item.companyId === companyId);
  if (!account) return null;
  return prisma.user.findFirst({
    where: { id: account.userId, companyId, status: "ACTIVE", role: "ADMIN" },
    select: { id: true, companyId: true, email: true, name: true, role: true },
  });
}
