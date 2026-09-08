import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import type { IfElseContact } from "@/lib/marketing/if-else";

export async function loadIfElseContact(
  companyId: string,
  customerId: string
): Promise<IfElseContact | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: {
      name: true,
      city: true,
      companyName: true,
      tags: true,
      leadSource: true,
      properties: { select: { city: true } },
    },
  });
  if (!customer) return null;

  const lastVisit = await prisma.visit.findFirst({
    where: { customerId, companyId, status: "COMPLETED" },
    orderBy: [{ endAt: "desc" }, { startAt: "desc" }],
    select: { endAt: true, startAt: true },
  });

  const invoices = await prisma.invoice.findMany({
    where: { customerId, companyId, status: { not: "VOID" } },
    include: { payments: true },
  });

  let ltv = 0;
  for (const invoice of invoices) {
    for (const payment of invoice.payments) {
      if (payment.refundedAt) continue;
      ltv += toNumber(payment.amount);
    }
  }

  const cities = [customer.city, ...customer.properties.map((property) => property.city)].filter(
    (city): city is string => Boolean(city?.trim())
  );

  return {
    name: customer.name ?? "",
    city: customer.city ?? "",
    cities,
    companyName: customer.companyName ?? "",
    tags: customer.tags ?? [],
    leadSource: customer.leadSource ?? "",
    ltv: Math.round(ltv * 100) / 100,
    lastAppointmentAt: lastVisit?.endAt ?? lastVisit?.startAt ?? null,
  };
}
