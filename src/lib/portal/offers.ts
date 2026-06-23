import { prisma } from "@/lib/prisma";
import { offerMatchesCustomer } from "./permissions";

export async function listPortalOffersForCustomer(
  companyId: string,
  customer: { tags: string[]; zip?: string | null }
) {
  const now = new Date();
  const offers = await prisma.portalOffer.findMany({
    where: {
      companyId,
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { sortOrder: "asc" },
  });

  return offers
    .filter((o) => offerMatchesCustomer(o.targeting, customer))
    .map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      imageUrl: o.imageUrl,
      ctaLabel: o.ctaLabel,
      ctaUrl: o.ctaUrl,
    }));
}
