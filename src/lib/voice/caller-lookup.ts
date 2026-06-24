import { VisitStatus } from "@prisma/client";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

export type CallerLookupResult = {
  customerId: string | null;
  name: string | null;
  phone: string;
  city: string | null;
  mostRecentVisitAt: string | null;
  doNotService: boolean;
};

export async function lookupCustomerByPhone(
  companyId: string,
  phone: string
): Promise<CallerLookupResult> {
  const normalized = normalizePhone(phone);

  let customer = await prisma.customer.findFirst({
    where: { companyId, phone: normalized },
    select: { id: true, name: true, phone: true, city: true, doNotService: true },
  });

  if (!customer) {
    const alt = await prisma.customerPhone.findFirst({
      where: { companyId, phone: normalized },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, city: true, doNotService: true },
        },
      },
    });
    customer = alt?.customer ?? null;
  }

  if (!customer) {
    return {
      customerId: null,
      name: null,
      phone: normalized,
      city: null,
      mostRecentVisitAt: null,
      doNotService: false,
    };
  }

  const [recentVisit, primaryProperty] = await Promise.all([
    prisma.visit.findFirst({
      where: {
        customerId: customer.id,
        startAt: { lte: new Date() },
        status: { not: VisitStatus.CANCELLED },
      },
      orderBy: { startAt: "desc" },
      select: { startAt: true, city: true },
    }),
    prisma.customerProperty.findFirst({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      select: { city: true },
    }),
  ]);

  const city =
    customer.city?.trim() ||
    recentVisit?.city?.trim() ||
    primaryProperty?.city?.trim() ||
    null;

  return {
    customerId: customer.id,
    name: customer.name,
    phone: normalized,
    city,
    mostRecentVisitAt: recentVisit?.startAt.toISOString() ?? null,
    doNotService: customer.doNotService,
  };
}
