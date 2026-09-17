import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Hard-delete a customer after clearing relations that often block cascade
 * (estimate selectedOption circular FK, maintenance billing → invoice links).
 */
export async function deleteCustomerForCompany(companyId: string, customerId: string) {
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false as const, notFound: true as const };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const propertyIds = (await tx.customerProperty.findMany({
        where: { companyId, customerId },
        select: { id: true },
      })).map((property) => property.id);
      // Careers / website leads often leave convertedCustomerId pointing here.
      await tx.lead.updateMany({
        where: { companyId, convertedCustomerId: customerId },
        data: { convertedCustomerId: null },
      });

      await tx.customer.updateMany({
        where: { companyId, referredByCustomerId: customerId },
        data: { referredByCustomerId: null },
      });

      // Estimate.selectedOptionId → EstimateOption can block estimate (and thus customer) deletes.
      await tx.estimate.updateMany({
        where: { customerId, companyId },
        data: { selectedOptionId: null },
      });

      const invoiceIds = (
        await tx.invoice.findMany({
          where: { customerId, companyId },
          select: { id: true },
        })
      ).map((row) => row.id);

      if (invoiceIds.length) {
        await tx.maintenancePlanBillingPeriod.updateMany({
          where: { invoiceId: { in: invoiceIds } },
          data: { invoiceId: null },
        });
      }

      // Visits keep history but must not block; customerId is optional / SetNull.
      await tx.visit.updateMany({
        where: { customerId, companyId },
        data: { customerId: null },
      });

      await tx.customer.delete({ where: { id: customerId } });
      await tx.hcpEntityMapping.deleteMany({
        where: {
          companyId,
          OR: [
            { entityType: "CUSTOMER", localId: customerId },
            ...(propertyIds.length ? [{ entityType: "PROPERTY" as const, localId: { in: propertyIds } }] : []),
          ],
        },
      });
    }, { timeout: 15_000 });

    return { ok: true as const };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014")
    ) {
      const detail =
        typeof error.meta?.field_name === "string"
          ? ` (${error.meta.field_name})`
          : typeof error.meta?.model_name === "string"
            ? ` (${error.meta.model_name})`
            : "";
      return {
        ok: false as const,
        notFound: false as const,
        error: `Cannot delete this customer because related records still reference them${detail}. Archive the customer instead, or remove linked data first.`,
      };
    }
    throw error;
  }
}

export async function bulkDeleteCustomers(companyId: string, customerIds: string[]) {
  const results = { deleted: 0, failed: [] as Array<{ id: string; reason: string }> };
  for (const id of customerIds) {
    const result = await deleteCustomerForCompany(companyId, id);
    if (result.ok) results.deleted += 1;
    else results.failed.push({
      id,
      reason: "notFound" in result && result.notFound
        ? "The selected customer was not found. Refresh the list and try again."
        : "error" in result ? result.error : "Could not delete this customer.",
    });
  }
  return results;
}
