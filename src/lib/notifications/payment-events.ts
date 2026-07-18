import { AppNotificationType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyStaffInApp } from "@/lib/notifications/in-app";

export async function notifyCashCheckPayment(params: {
  companyId: string;
  invoiceId: string;
  visitId: string | null;
  amount: number;
  method: "CASH" | "CHECK";
  customerName: string;
  invoiceNumber: string;
  recordedByUserId: string | null;
}) {
  const admins = await prisma.user.findMany({
    where: {
      companyId: params.companyId,
      status: "ACTIVE",
      role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
    },
    select: { id: true, name: true },
  });
  if (!admins.length) return;

  let recordedByName: string | null = null;
  if (params.recordedByUserId) {
    recordedByName =
      (
        await prisma.user.findFirst({
          where: { id: params.recordedByUserId, companyId: params.companyId },
          select: { name: true },
        })
      )?.name ?? null;
  }

  const methodLabel = params.method === "CASH" ? "Cash" : "Check";
  const amountLabel = params.amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const title = `${methodLabel} payment collected`;
  const body = [
    `${amountLabel} from ${params.customerName}`,
    `Invoice ${params.invoiceNumber}`,
    recordedByName ? `Recorded by ${recordedByName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const href = params.visitId
    ? `/visits/${params.visitId}`
    : `/customers/invoices?invoiceId=${params.invoiceId}`;

  await notifyStaffInApp({
    companyId: params.companyId,
    type: AppNotificationType.PAYMENT_RECEIVED,
    title,
    body,
    href,
    userIds: admins.map((user) => user.id),
  });
}
