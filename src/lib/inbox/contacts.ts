import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/inbox/phone";

export { normalizePhone, formatPhoneDisplay } from "@/lib/inbox/phone";

export async function isContactBlocked(
  companyId: string,
  phone?: string | null,
  email?: string | null
) {
  if (!phone && !email) return false;

  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const normalizedEmail = email?.toLowerCase() ?? null;

  const blocked = await prisma.blockedContact.findFirst({
    where: {
      companyId,
      OR: [
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ],
    },
  });

  return Boolean(blocked);
}

export async function blockCustomer(params: {
  companyId: string;
  blockedBy: string;
  customerId?: string;
  phone?: string | null;
  email?: string | null;
  reason?: string;
}) {
  const phone = params.phone ? normalizePhone(params.phone) : null;
  const email = params.email?.toLowerCase() ?? null;

  if (params.customerId) {
    return prisma.blockedContact.upsert({
      where: { customerId: params.customerId },
      update: {
        phone,
        email,
        blockedBy: params.blockedBy,
        reason: params.reason,
        blockedAt: new Date(),
      },
      create: {
        companyId: params.companyId,
        customerId: params.customerId,
        phone,
        email,
        blockedBy: params.blockedBy,
        reason: params.reason,
      },
    });
  }

  return prisma.blockedContact.create({
    data: {
      companyId: params.companyId,
      phone,
      email,
      blockedBy: params.blockedBy,
      reason: params.reason,
    },
  });
}

export async function unblockCustomer(companyId: string, blockedId: string) {
  const entry = await prisma.blockedContact.findFirst({
    where: { id: blockedId, companyId },
  });
  if (!entry) return null;
  return prisma.blockedContact.delete({ where: { id: blockedId } });
}
