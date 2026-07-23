import { CustomerStatus } from "@prisma/client";
import { bulkDeleteCustomers } from "@/lib/customers/delete";
import { mergeCustomers } from "@/lib/customers/merge";
import { prisma } from "@/lib/prisma";

export { bulkDeleteCustomers };

export async function bulkArchiveCustomers(companyId: string, customerIds: string[], archive: boolean) {
  await prisma.customer.updateMany({
    where: { companyId, id: { in: customerIds } },
    data: { status: archive ? CustomerStatus.ARCHIVED : CustomerStatus.ACTIVE },
  });
}

export async function bulkSetDoNotService(
  companyId: string,
  customerIds: string[],
  doNotService: boolean
) {
  await prisma.customer.updateMany({
    where: { companyId, id: { in: customerIds } },
    data: { doNotService },
  });
}

export async function bulkMergeCustomers(
  companyId: string,
  targetCustomerId: string,
  sourceCustomerIds: string[]
) {
  for (const sourceId of sourceCustomerIds) {
    if (sourceId === targetCustomerId) continue;
    await mergeCustomers({ companyId, sourceId, targetId: targetCustomerId });
  }
}
