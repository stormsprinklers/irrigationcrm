import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Customers with lifetime value: at least one non-refunded payment
 * on a non-void invoice. Matches getCustomerSummary() LTV.
 */
export function customerHasLifetimeValueWhere(): Prisma.CustomerWhereInput {
  return {
    invoices: {
      some: {
        status: { not: "VOID" },
        payments: { some: { refundedAt: null } },
      },
    },
  };
}

export function customerHasNoLifetimeValueWhere(): Prisma.CustomerWhereInput {
  return { NOT: customerHasLifetimeValueWhere() };
}

export type CustomerRecordSegment = "CUSTOMERS" | "CONTACTS";

export function customerSegmentWhere(
  segment: CustomerRecordSegment | null | undefined
): Prisma.CustomerWhereInput | null {
  if (segment === "CUSTOMERS") return customerHasLifetimeValueWhere();
  if (segment === "CONTACTS") return customerHasNoLifetimeValueWhere();
  return null;
}

export function parseCustomerRecordSegment(
  value: string | null | undefined
): CustomerRecordSegment | undefined {
  if (value === "CUSTOMERS" || value === "CONTACTS") return value;
  return undefined;
}

export async function customerIsContact(companyId: string, customerId: string) {
  const paid = await prisma.invoice.findFirst({
    where: {
      companyId,
      customerId,
      status: { not: "VOID" },
      payments: { some: { refundedAt: null } },
    },
    select: { id: true },
  });
  return paid == null;
}
