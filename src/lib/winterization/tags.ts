import { prisma } from "@/lib/prisma";
import { mergeCustomerTags } from "@/lib/marketing/add-tag";
import { winterizationSeasonTag, winterizationSeasonYear } from "@/lib/winterization/weeks";

export { winterizationSeasonTag } from "@/lib/winterization/weeks";

function alreadyHasTag(tags: string[], tag: string) {
  const key = tag.toLowerCase();
  return tags.some((item) => item.toLowerCase() === key);
}

export async function applyWinterizationSeasonTag(
  customerId: string | null | undefined,
  seasonYear = winterizationSeasonYear()
) {
  if (!customerId) return;
  const tag = winterizationSeasonTag(seasonYear);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, tags: true },
  });
  if (!customer || alreadyHasTag(customer.tags, tag)) return;
  await prisma.customer.update({
    where: { id: customer.id },
    data: { tags: mergeCustomerTags(customer.tags, [tag]) },
  });
}

export async function ensureWinterizationSeasonTags(
  customerIds: Array<string | null | undefined>,
  seasonYear = winterizationSeasonYear()
) {
  const ids = [...new Set(customerIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const tag = winterizationSeasonTag(seasonYear);
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, tags: true },
  });
  await Promise.all(
    customers
      .filter((customer) => !alreadyHasTag(customer.tags, tag))
      .map((customer) =>
        prisma.customer.update({
          where: { id: customer.id },
          data: { tags: mergeCustomerTags(customer.tags, [tag]) },
        })
      )
  );
}
