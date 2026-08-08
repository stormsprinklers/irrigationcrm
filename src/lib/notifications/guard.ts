import { isContactBlocked } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";
import { isAppointmentReminderEvent } from "@/lib/marketing/unsubscribe";

export type NotificationGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export async function assertCustomerCanReceiveNotifications(params: {
  companyId: string;
  customerId?: string | null;
  phone?: string | null;
  email?: string | null;
  /** When set, enforces per-channel appointment reminder opt-outs for visit events. */
  event?: string | null;
  channel?: "EMAIL" | "SMS" | null;
}): Promise<NotificationGuardResult> {
  if (params.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: params.customerId, companyId: params.companyId },
      select: {
        doNotService: true,
        phone: true,
        email: true,
        appointmentReminderEmailOptOut: true,
        appointmentReminderSmsOptOut: true,
      },
    });
    if (!customer) return { allowed: false, reason: "customer not found" };
    if (customer.doNotService) return { allowed: false, reason: "do not service" };

    if (params.event && isAppointmentReminderEvent(params.event)) {
      if (params.channel === "EMAIL" && customer.appointmentReminderEmailOptOut) {
        return { allowed: false, reason: "appointment reminder email opt-out" };
      }
      if (params.channel === "SMS" && customer.appointmentReminderSmsOptOut) {
        return { allowed: false, reason: "appointment reminder SMS opt-out" };
      }
    }

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
