import { prisma } from "@/lib/prisma";

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

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

export function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
