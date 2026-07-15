import { prisma } from "@/lib/prisma";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";

/**
 * Attach orphaned CallLogs (and sessions) to customers by US phone match.
 * Safe to run repeatedly — only updates rows with null customerId.
 */
export async function backfillCallLogCustomers(options?: {
  companyId?: string;
  take?: number;
}): Promise<{ scanned: number; updated: number }> {
  const take = options?.take ?? 2000;
  const logs = await prisma.callLog.findMany({
    where: {
      customerId: null,
      scope: "EXTERNAL",
      ...(options?.companyId ? { companyId: options.companyId } : {}),
    },
    select: {
      id: true,
      companyId: true,
      direction: true,
      fromNumber: true,
      toNumber: true,
      sessionId: true,
    },
    orderBy: { startedAt: "desc" },
    take,
  });

  let updated = 0;
  for (const log of logs) {
    const phone = log.direction === "INBOUND" ? log.fromNumber : log.toNumber;
    if (!phone?.trim()) continue;
    try {
      const customer = await findCustomerByPhone(log.companyId, phone);
      if (!customer) continue;
      await prisma.callLog.update({
        where: { id: log.id },
        data: { customerId: customer.id },
      });
      if (log.sessionId) {
        await prisma.callSession.updateMany({
          where: { id: log.sessionId, customerId: null },
          data: { customerId: customer.id },
        });
      }
      await prisma.callConversion.updateMany({
        where: { callLogId: log.id, customerId: null },
        data: { customerId: customer.id },
      });
      updated += 1;
    } catch (err) {
      console.error("backfillCallLogCustomers failed for", log.id, err);
    }
  }

  return { scanned: logs.length, updated };
}
