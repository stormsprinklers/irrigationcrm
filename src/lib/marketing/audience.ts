import type { CampaignChannel, Prisma } from "@prisma/client";
import type { AudienceFilters } from "@/lib/marketing/types";
import { prisma } from "@/lib/prisma";

export async function buildAudienceWhere(
  companyId: string,
  channel: CampaignChannel,
  filters?: AudienceFilters | null
): Promise<Prisma.CustomerWhereInput> {
  const where: Prisma.CustomerWhereInput = {
    companyId,
    status: "ACTIVE",
    doNotService: false,
  };

  if (channel === "EMAIL") {
    where.AND = [{ email: { not: null } }, { NOT: { email: "" } }];
  } else {
    where.AND = [{ phone: { not: null } }, { NOT: { phone: "" } }];
  }

  const cities = filters?.cities?.filter(Boolean) ?? [];
  if (cities.length > 0) {
    where.OR = [
      { city: { in: cities, mode: "insensitive" } },
      { properties: { some: { city: { in: cities, mode: "insensitive" } } } },
    ];
  }

  const tags = filters?.tags?.filter(Boolean) ?? [];
  if (tags.length > 0) {
    where.tags = { hasSome: tags };
  }

  const servicedFrom = filters?.servicedFrom ? new Date(filters.servicedFrom) : null;
  const servicedTo = filters?.servicedTo ? new Date(filters.servicedTo) : null;
  const itemIds = filters?.priceBookItemIds?.filter(Boolean) ?? [];

  if (servicedFrom || servicedTo || itemIds.length > 0) {
    const visitWhere: Prisma.VisitWhereInput = { status: "COMPLETED" };
    if (servicedFrom || servicedTo) {
      visitWhere.endAt = {};
      if (servicedFrom) visitWhere.endAt.gte = servicedFrom;
      if (servicedTo) visitWhere.endAt.lte = servicedTo;
    }
    if (itemIds.length > 0) {
      visitWhere.lineItems = {
        some: {
          OR: [
            { priceBookItemId: { in: itemIds } },
            { name: { in: await priceBookItemNames(itemIds) } },
          ],
        },
      };
    }
    where.visits = { some: visitWhere };
  }

  return where;
}

async function priceBookItemNames(ids: string[]) {
  const items = await prisma.priceBookItem.findMany({
    where: { id: { in: ids } },
    select: { name: true },
  });
  return items.map((i) => i.name);
}

export async function queryAudienceCustomers(
  companyId: string,
  channel: CampaignChannel,
  filters?: AudienceFilters | null,
  take?: number
) {
  const where = await buildAudienceWhere(companyId, channel, filters);
  const customers = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      tags: true,
    },
    orderBy: { name: "asc" },
    ...(take ? { take } : {}),
  });

  const blocked = await prisma.blockedContact.findMany({
    where: { companyId },
    select: { email: true, phone: true, customerId: true },
  });
  const blockedEmails = new Set(
    blocked.map((b) => b.email?.toLowerCase()).filter(Boolean) as string[]
  );
  const blockedPhones = new Set(blocked.map((b) => b.phone).filter(Boolean) as string[]);
  const blockedCustomerIds = new Set(
    blocked.map((b) => b.customerId).filter(Boolean) as string[]
  );

  return customers.filter((c) => {
    if (blockedCustomerIds.has(c.id)) return false;
    if (channel === "EMAIL" && c.email && blockedEmails.has(c.email.toLowerCase())) return false;
    if (channel === "SMS" && c.phone && blockedPhones.has(c.phone)) return false;
    return true;
  });
}

export async function previewAudience(
  companyId: string,
  channel: CampaignChannel,
  filters?: AudienceFilters | null
) {
  const customers = await queryAudienceCustomers(companyId, channel, filters);
  return {
    count: customers.length,
    sample: customers.slice(0, 10),
  };
}

export async function listAudienceCities(companyId: string) {
  const [customerCities, propertyCities] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId, city: { not: null } },
      select: { city: true },
      distinct: ["city"],
    }),
    prisma.customerProperty.findMany({
      where: { companyId, city: { not: null } },
      select: { city: true },
      distinct: ["city"],
    }),
  ]);
  const cities = new Set<string>();
  for (const row of [...customerCities, ...propertyCities]) {
    if (row.city?.trim()) cities.add(row.city.trim());
  }
  return Array.from(cities).sort((a, b) => a.localeCompare(b));
}

export async function listAudienceTags(companyId: string) {
  const customers = await prisma.customer.findMany({
    where: { companyId },
    select: { tags: true },
  });
  const tags = new Set<string>();
  for (const c of customers) {
    for (const tag of c.tags) tags.add(tag);
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}
