import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AI_RECEPTIONIST_SYSTEM_KIND } from "@/lib/ai-receptionist/types";

/** Ensure a non-login system user exists for AI-authored notes. */
export async function ensureAiReceptionistSystemUser(companyId: string) {
  const existing = await prisma.user.findFirst({
    where: { companyId, systemKind: AI_RECEPTIONIST_SYSTEM_KIND },
    select: { id: true },
  });
  if (existing) return existing.id;

  const email = `ai-receptionist+${companyId}@system.local`;
  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true, companyId: true, systemKind: true },
  });
  if (byEmail && byEmail.companyId === companyId) {
    if (byEmail.systemKind !== AI_RECEPTIONIST_SYSTEM_KIND) {
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { systemKind: AI_RECEPTIONIST_SYSTEM_KIND },
      });
    }
    return byEmail.id;
  }

  const created = await prisma.user.create({
    data: {
      companyId,
      email,
      name: "AI Receptionist",
      firstName: "AI",
      lastName: "Receptionist",
      role: UserRole.ADMIN,
      systemKind: AI_RECEPTIONIST_SYSTEM_KIND,
      passwordHash: null,
    },
    select: { id: true },
  });
  return created.id;
}
