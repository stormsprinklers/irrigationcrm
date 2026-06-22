import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CustomerDTO, CustomerListFilters, CustomerPropertyDTO } from "./types";

export const customerInclude = {
  _count: { select: { properties: true, visits: true, estimates: true, invoices: true } },
} satisfies Prisma.CustomerInclude;

type CustomerPayload = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;

export function serializeCustomer(customer: CustomerPayload): CustomerDTO {
  return {
    id: customer.id,
    name: customer.name,
    companyName: customer.companyName,
    address: customer.address,
    city: customer.city,
    state: customer.state,
    zip: customer.zip,
    phone: customer.phone,
    email: customer.email,
    leadSource: customer.leadSource,
    status: customer.status,
    doNotService: customer.doNotService,
    tags: customer.tags ?? [],
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    propertyCount: customer._count.properties,
    visitCount: customer._count.visits,
    estimateCount: customer._count.estimates,
    invoiceCount: customer._count.invoices,
  };
}

export function serializeProperty(property: {
  id: string;
  customerId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  isPrimary: boolean;
  createdAt: Date;
}): CustomerPropertyDTO {
  return {
    id: property.id,
    customerId: property.customerId,
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    isPrimary: property.isPrimary,
    createdAt: property.createdAt.toISOString(),
  };
}

export async function listCustomers(companyId: string, filters: CustomerListFilters = {}) {
  const where: Prisma.CustomerWhereInput = { companyId };
  const and: Prisma.CustomerWhereInput[] = [];

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { phones: { some: { phone: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  if (filters.city?.trim()) {
    const q = filters.city.trim();
    and.push({
      OR: [
        { city: { contains: q, mode: "insensitive" } },
        { properties: { some: { city: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  if (filters.zip?.trim()) {
    const q = filters.zip.trim();
    and.push({
      OR: [
        { zip: { contains: q, mode: "insensitive" } },
        { properties: { some: { zip: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  if (filters.leadSource?.trim()) {
    and.push({
      leadSource: { contains: filters.leadSource.trim(), mode: "insensitive" },
    });
  }

  if (filters.company?.trim()) {
    and.push({
      companyName: { contains: filters.company.trim(), mode: "insensitive" },
    });
  }

  if (filters.status === "ARCHIVED") {
    and.push({ status: "ARCHIVED" });
  } else if (filters.status !== "ALL") {
    and.push({ status: "ACTIVE" });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  const customers = await prisma.customer.findMany({
    where,
    include: customerInclude,
    orderBy: { name: "asc" },
    take: 500,
  });

  return customers.map(serializeCustomer);
}

export async function getCustomerForCompany(companyId: string, customerId: string) {
  return prisma.customer.findFirst({
    where: { id: customerId, companyId },
    include: customerInclude,
  });
}

export async function listCustomerProperties(companyId: string, customerId: string) {
  return prisma.customerProperty.findMany({
    where: { customerId, companyId },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });
}
