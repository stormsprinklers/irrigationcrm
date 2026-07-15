import { VisitStatus } from "@prisma/client";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { normalizePhone } from "@/lib/inbox/phone";
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
  const match = await findCustomerByPhone(companyId, phone);

  if (!match) {
    return {
      customerId: null,
      name: null,
      phone: normalized,
      city: null,
      mostRecentVisitAt: null,
      doNotService: false,
    };
  }

  const [customer, recentVisit, primaryProperty] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: match.id },
      select: { id: true, name: true, city: true, doNotService: true },
    }),
    prisma.visit.findFirst({
      where: {
        customerId: match.id,
        startAt: { lte: new Date() },
        status: { not: VisitStatus.CANCELLED },
      },
      orderBy: { startAt: "desc" },
      select: { startAt: true, city: true },
    }),
    prisma.customerProperty.findFirst({
      where: { customerId: match.id },
      orderBy: { createdAt: "desc" },
      select: { city: true },
    }),
  ]);

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
