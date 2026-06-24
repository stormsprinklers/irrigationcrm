import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/inbox/phone";

export type CustomerContact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  doNotService: boolean;
};

function phoneLookupVariants(phone: string) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const variants = new Set<string>([normalized, phone.trim()]);
  if (last10) {
    variants.add(last10);
    variants.add(`+1${last10}`);
    variants.add(`1${last10}`);
  }
  return [...variants].filter(Boolean);
}

export async function findCustomerByPhone(
  companyId: string,
  phone: string
): Promise<CustomerContact | null> {
  const variants = phoneLookupVariants(phone);

  const customer = await prisma.customer.findFirst({
    where: {
      companyId,
      OR: variants.map((value) => ({ phone: value })),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      doNotService: true,
    },
  });

  if (customer) return customer;

  const alt = await prisma.customerPhone.findFirst({
    where: {
      companyId,
      OR: variants.map((value) => ({ phone: value })),
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          doNotService: true,
        },
      },
    },
  });

  return alt?.customer ?? null;
}
