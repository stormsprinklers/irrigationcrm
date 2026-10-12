import { prisma } from "@/lib/prisma";
import { canAccessMobileApp } from "@/lib/employees";

/** Same access rule as the CRM's company switcher: same email or an existing link. */
export async function resolveMobileCompanyAccount(currentUserId: string, targetUserId: string) {
  const [current, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: currentUserId }, select: { email: true } }),
    prisma.user.findFirst({
      where: { id: targetUserId, status: "ACTIVE", systemKind: null },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    }),
  ]);
  if (!current || !target || !canAccessMobileApp(target.role)) return null;
  if (current.email.toLowerCase() === target.email.toLowerCase()) return target;
  const link = await prisma.userAccountLink.findFirst({ where: { OR: [
    { userId: currentUserId, linkedUserId: targetUserId },
    { userId: targetUserId, linkedUserId: currentUserId },
  ] } });
  return link ? target : null;
}
