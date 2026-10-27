import { AppNotificationType, UserRole } from "@prisma/client";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

const CUSTOMER_ESTIMATE_APPROVAL_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.CSR,
];

function formatCurrency(value: unknown) {
  return toNumber(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Bell + web/native push for office staff after a customer signs an estimate. */
export async function notifyCustomerEstimateApproved(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      companyId: true,
      customerId: true,
      estimateNumber: true,
      signedAt: true,
      selectedOptionId: true,
      total: true,
      customer: { select: { name: true } },
      options: { select: { id: true, total: true } },
    },
  });
  if (!estimate?.signedAt) return;

  const href = `/estimates/${estimate.id}`;
  const alreadyNotified = await prisma.appNotification.findFirst({
    where: {
      companyId: estimate.companyId,
      type: AppNotificationType.ESTIMATE_APPROVED,
      href,
    },
    select: { id: true },
  });
  if (alreadyNotified) return;

  const recipients = await prisma.user.findMany({
    where: {
      companyId: estimate.companyId,
      status: "ACTIVE",
      role: { in: CUSTOMER_ESTIMATE_APPROVAL_ROLES },
    },
    select: { id: true },
  });
  if (!recipients.length) return;

  const selectedTotal = estimate.selectedOptionId
    ? estimate.options.find((option) => option.id === estimate.selectedOptionId)?.total
    : null;
  const estimateLabel = estimate.estimateNumber
    ? `Estimate ${estimate.estimateNumber}`
    : "Estimate";

  await notifyStaffInApp({
    companyId: estimate.companyId,
    userIds: recipients.map((user) => user.id),
    type: AppNotificationType.ESTIMATE_APPROVED,
    title: `Estimate approved by ${estimate.customer.name}`,
    body: `${estimateLabel} · ${formatCurrency(selectedTotal ?? estimate.total)}`,
    href,
    estimateId: estimate.id,
    customerId: estimate.customerId,
    deepLink: `stormcrm://estimate/${estimate.id}`,
  });
}
