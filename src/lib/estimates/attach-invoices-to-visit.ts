import { prisma } from "@/lib/prisma";

/**
 * Deposit and approval-payment invoices are created before an installation visit
 * exists. Once the visit is available, attach those invoices so every client can
 * calculate the visit's paid amount and remaining balance from the same record.
 */
export async function attachEstimateInvoicesToVisit(params: {
  companyId: string;
  estimateId: string;
  visitId: string;
}) {
  await prisma.$transaction([
    prisma.invoice.updateMany({
      where: {
        companyId: params.companyId,
        estimateId: params.estimateId,
        visitId: null,
      },
      data: { visitId: params.visitId },
    }),
    prisma.estimate.updateMany({
      where: {
        id: params.estimateId,
        companyId: params.companyId,
        visitId: null,
      },
      data: { visitId: params.visitId },
    }),
  ]);
}

/** Repairs older estimate-created visits whose deposit invoice predates the link. */
export async function attachEstimateInvoicesForVisit(params: {
  companyId: string;
  visitId: string;
}) {
  const visit = await prisma.visit.findFirst({
    where: { id: params.visitId, companyId: params.companyId },
    select: {
      estimateId: true,
      estimates: { select: { id: true } },
    },
  });
  if (!visit) return;

  const estimateIds = [
    ...(visit.estimateId ? [visit.estimateId] : []),
    ...visit.estimates.map((estimate) => estimate.id),
  ].filter((id, index, ids) => ids.indexOf(id) === index);

  if (!estimateIds.length) return;

  await prisma.$transaction([
    prisma.invoice.updateMany({
      where: {
        companyId: params.companyId,
        estimateId: { in: estimateIds },
        visitId: null,
      },
      data: { visitId: params.visitId },
    }),
    prisma.estimate.updateMany({
      where: {
        companyId: params.companyId,
        id: { in: estimateIds },
        visitId: null,
      },
      data: { visitId: params.visitId },
    }),
  ]);
}

/** Repairs deposit links before rendering a customer's invoice and visit history. */
export async function attachEstimateInvoicesForCustomer(params: {
  companyId: string;
  customerId: string;
}) {
  const [estimates, visits] = await Promise.all([
    prisma.estimate.findMany({
      where: {
        companyId: params.companyId,
        customerId: params.customerId,
        visitId: { not: null },
      },
      select: { id: true, visitId: true },
    }),
    prisma.visit.findMany({
      where: {
        companyId: params.companyId,
        customerId: params.customerId,
        estimateId: { not: null },
      },
      select: { id: true, estimateId: true },
    }),
  ]);

  const visitByEstimate = new Map<string, string>();
  for (const estimate of estimates) {
    if (estimate.visitId) visitByEstimate.set(estimate.id, estimate.visitId);
  }
  for (const visit of visits) {
    if (visit.estimateId && !visitByEstimate.has(visit.estimateId)) {
      visitByEstimate.set(visit.estimateId, visit.id);
    }
  }
  if (!visitByEstimate.size) return;

  await prisma.$transaction(
    [...visitByEstimate].map(([estimateId, visitId]) =>
      prisma.invoice.updateMany({
        where: {
          companyId: params.companyId,
          customerId: params.customerId,
          estimateId,
          visitId: null,
        },
        data: { visitId },
      })
    )
  );
}
