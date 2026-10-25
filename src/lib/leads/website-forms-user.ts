import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const WEBSITE_FORMS_SYSTEM_KIND = "WEBSITE_FORMS";

/** Non-login account used to identify attachments submitted by customers online. */
export async function ensureWebsiteFormsSystemUser(companyId: string) {
  const existing = await prisma.user.findFirst({
    where: { companyId, systemKind: WEBSITE_FORMS_SYSTEM_KIND },
    select: { id: true },
  });
  if (existing) return existing.id;

  const email = `website-forms+${companyId}@system.local`;
  const byEmail = await prisma.user.findFirst({
    where: { companyId, email },
    select: { id: true, systemKind: true },
  });
  if (byEmail) {
    if (byEmail.systemKind !== WEBSITE_FORMS_SYSTEM_KIND) {
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { systemKind: WEBSITE_FORMS_SYSTEM_KIND },
      });
    }
    return byEmail.id;
  }

  const created = await prisma.user.create({
    data: {
      companyId,
      email,
      name: "Website Forms",
      firstName: "Website",
      lastName: "Forms",
      role: UserRole.CSR,
      systemKind: WEBSITE_FORMS_SYSTEM_KIND,
      passwordHash: null,
    },
    select: { id: true },
  });
  return created.id;
}
