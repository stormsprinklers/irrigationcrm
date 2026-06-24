import { isContactBlocked } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

export type NotificationGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export async function assertCustomerCanReceiveNotifications(params: {
  companyId: string;
  customerId?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<NotificationGuardResult> {
  if (params.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: params.customerId, companyId: params.companyId },
      select: { doNotService: true, phone: true, email: true },
    });
    if (!customer) return { allowed: false, reason: "customer not found" };
    if (customer.doNotService) return { allowed: false, reason: "do not service" };

    const phone = params.phone ?? customer.phone;
    const email = params.email ?? customer.email;
    if (await isContactBlocked(params.companyId, phone, email)) {
      return { allowed: false, reason: "contact blocked" };
    }
    return { allowed: true };
  }

  if (await isContactBlocked(params.companyId, params.phone, params.email)) {
    return { allowed: false, reason: "contact blocked" };
  }

  return { allowed: true };
}
