import { addDays } from "date-fns";
import { DepositType, Division, EstimateStatus, VisitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import { sendSupplierPartsList } from "@/lib/design/supplier-email";

export function computeDepositAmount(estimate: {
  total: unknown;
  depositType: DepositType | null;
  depositAmount: unknown | null;
  depositRequired: boolean;
}) {
  if (!estimate.depositRequired) return 0;
  const total = toNumber(estimate.total);
  if (estimate.depositType === DepositType.PERCENT && estimate.depositAmount != null) {
    return Math.round(total * (toNumber(estimate.depositAmount) / 100) * 100) / 100;
  }
  if (estimate.depositType === DepositType.FIXED && estimate.depositAmount != null) {
    return toNumber(estimate.depositAmount);
  }
  return Math.round(total * 0.5 * 100) / 100;
}

export async function createInstallVisitFromEstimate(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      customer: true,
      property: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!estimate) return null;

  const existing = await prisma.visit.findFirst({
    where: { companyId: estimate.companyId, estimateId: estimate.id },
  });
  if (existing) return existing;

  const serviceArea = await prisma.serviceArea.findFirst({
    where: { companyId: estimate.companyId },
    orderBy: { createdAt: "asc" },
  });
  if (!serviceArea) return null;

  const durationDays = estimate.installDurationDays ?? 4;
  const startAt = addDays(new Date(), 7);
  const endAt = addDays(startAt, durationDays);

  const visit = await prisma.visit.create({
    data: {
      companyId: estimate.companyId,
      customerId: estimate.customerId,
      propertyId: estimate.propertyId,
      title: `Install — ${estimate.customer.name}`,
      startAt,
      endAt,
      division: Division.INSTALL,
      serviceAreaId: serviceArea.id,
      status: VisitStatus.UNSCHEDULED,
      address: estimate.property?.address ?? estimate.customer.address ?? null,
      city: estimate.property?.city ?? estimate.customer.city ?? null,
      state: estimate.property?.state ?? estimate.customer.state ?? null,
      zip: estimate.property?.zip ?? estimate.customer.zip ?? null,
      designProjectId: estimate.designProjectId,
      designVersionId: estimate.designVersionId,
      designExportMetadata: estimate.designExportMetadata ?? undefined,
      installDurationDays: durationDays,
      estimateId: estimate.id,
      lineItems: {
        create: estimate.lineItems.map((item, index) => ({
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          sortOrder: index,
        })),
      },
    },
  });

  return visit;
}

export async function finalizeEstimateBooking(estimateId: string) {
  const estimate = await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      needsScheduling: true,
      depositPaidAt: new Date(),
    },
    include: { company: true },
  });

  await createInstallVisitFromEstimate(estimateId);

  if (estimate.company.supplierPartsAutoSend && estimate.company.supplierEmail) {
    await sendSupplierPartsList(estimateId).catch((err) => {
      console.error("Supplier parts email failed:", err);
    });
  }

  return estimate;
}

export async function handleEstimateApprovedWithoutDeposit(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { company: true },
  });
  if (!estimate) return;
  if (estimate.depositRequired && computeDepositAmount(estimate) > 0) return;
  await finalizeEstimateBooking(estimateId);
}
