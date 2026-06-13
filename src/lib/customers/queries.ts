import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CustomerDTO, CustomerPropertyDTO } from "./types";

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

export async function listCustomers(companyId: string, search?: string) {
  const where: Prisma.CustomerWhereInput = { companyId };

  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
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
