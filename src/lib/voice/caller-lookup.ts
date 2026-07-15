import { VisitStatus } from "@prisma/client";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { normalizePhone } from "@/lib/inbox/phone";
import { getCustomerSummary } from "@/lib/customers/summary";
import { formatCustomerAddress } from "@/lib/customers/maps";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

export type CallerRecentVisit = {
  id: string;
  title: string;
  startAt: string;
  status: string;
  total: number;
  balanceDue: number;
  technicianName: string | null;
};

export type CallerLookupResult = {
  customerId: string | null;
  name: string | null;
  phone: string;
  city: string | null;
  mostRecentVisitAt: string | null;
  doNotService: boolean;
  lifetimeValue: number | null;
  outstandingBalance: number | null;
  propertyAddress: string | null;
  recentVisits: CallerRecentVisit[];
};

export async function lookupCustomerByPhone(
  companyId: string,
  phone: string
): Promise<CallerLookupResult> {
  const normalized = normalizePhone(phone);
  const empty: CallerLookupResult = {
    customerId: null,
    name: null,
    phone: normalized,
    city: null,
    mostRecentVisitAt: null,
    doNotService: false,
    lifetimeValue: null,
    outstandingBalance: null,
    propertyAddress: null,
    recentVisits: [],
  };

  const match = await findCustomerByPhone(companyId, phone);
  if (!match) return empty;

  const [customer, recentVisitRows, primaryProperty, summary] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: match.id },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        state: true,
        zip: true,
        doNotService: true,
      },
    }),
    prisma.visit.findMany({
      where: {
        customerId: match.id,
        companyId,
        status: { not: VisitStatus.CANCELLED },
      },
      orderBy: { startAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        startAt: true,
        status: true,
        assignedUser: { select: { name: true } },
        lineItems: { select: { quantity: true, unitPrice: true, total: true } },
        discounts: { select: { amount: true } },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            total: true,
            status: true,
            payments: { select: { amount: true, refundedAt: true } },
          },
        },
      },
    }),
    prisma.customerProperty.findFirst({
      where: { customerId: match.id, companyId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      select: {
        address: true,
        city: true,
        state: true,
        zip: true,
        name: true,
      },
    }),
    getCustomerSummary(companyId, match.id),
  ]);

  if (!customer) return empty;

  const recentVisits: CallerRecentVisit[] = recentVisitRows.map((v) => {
    const lineTotal = v.lineItems.reduce(
      (sum, li) => sum + toNumber(li.total ?? 0),
      0
    );
    const discountTotal = v.discounts.reduce((sum, d) => sum + toNumber(d.amount), 0);
    const visitTotal = Math.max(0, lineTotal - discountTotal);
    const invoice = v.invoices[0];
    let balanceDue = 0;
    if (invoice && invoice.status !== "PAID" && invoice.status !== "REFUNDED" && invoice.status !== "VOID") {
      const paid = invoice.payments.reduce((sum, p) => {
        if (p.refundedAt) return sum;
        return sum + toNumber(p.amount);
      }, 0);
      balanceDue = Math.max(0, toNumber(invoice.total) - paid);
    }
    return {
      id: v.id,
      title: v.title,
      startAt: v.startAt.toISOString(),
      status: v.status,
      total: Math.round(visitTotal * 100) / 100,
      balanceDue: Math.round(balanceDue * 100) / 100,
      technicianName: v.assignedUser?.name ?? null,
    };
  });

  const propertyAddress =
    (primaryProperty
      ? formatCustomerAddress({
          address: primaryProperty.address,
          city: primaryProperty.city,
          state: primaryProperty.state,
          zip: primaryProperty.zip,
        })
      : null) ||
    formatCustomerAddress({
      address: customer.address,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
    }) ||
    null;

  return {
    customerId: customer.id,
    name: customer.name,
    phone: normalized,
    city: customer.city?.trim() || primaryProperty?.city?.trim() || null,
    mostRecentVisitAt: recentVisits[0]?.startAt ?? null,
    doNotService: customer.doNotService,
    lifetimeValue: summary?.lifetimeValue ?? null,
    outstandingBalance: summary?.outstandingBalance ?? null,
    propertyAddress,
    recentVisits,
  };
}
