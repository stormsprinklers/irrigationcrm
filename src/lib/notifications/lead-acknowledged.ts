import type { Lead } from "@prisma/client";
import { customerBookingUrl } from "@/lib/company/customer-url";
import { parseLeadServiceAddress } from "@/lib/leads/address-from-notes";
import { formatCustomerAddress } from "@/lib/notifications/context";
import { sendOperationalNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

function firstNameFrom(name: string) {
  const part = name.trim().split(/\s+/)[0];
  return part || "there";
}

/**
 * Customer-facing SMS/email when a website lead is received (quote consent).
 */
export async function notifyLeadAcknowledged(companyId: string, lead: Lead) {
  const meta =
    lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
      ? (lead.metadata as Record<string, unknown>)
      : {};

  const consents =
    meta.consents && typeof meta.consents === "object" && !Array.isArray(meta.consents)
      ? (meta.consents as Record<string, unknown>)
      : {};

  // Require quote consent (or legacy missing = allow for non-estimate sources)
  if (consents.quote === false) return;
  if (!lead.phone && !lead.email) return;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      bookingSlug: true,
      onlineBookingEnabled: true,
      phone: true,
      customerBaseUrl: true,
    },
  });
  if (!company) return;

  const soft =
    meta.softEstimate && typeof meta.softEstimate === "object" && !Array.isArray(meta.softEstimate)
      ? (meta.softEstimate as Record<string, unknown>)
      : null;
  const rangeLabel =
    typeof soft?.label === "string" && soft.label
      ? `Estimated range: ${soft.label}`
      : "";

  const bookingLink =
    company.onlineBookingEnabled ? customerBookingUrl(company) ?? "" : "";

  await sendOperationalNotification({
    companyId,
    event: "LEAD_ACKNOWLEDGED",
    recipient: {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
    },
    context: {
      customer_first_name: firstNameFrom(lead.name),
      customer_last_name: lead.name.trim().split(/\s+/).slice(1).join(" ") || "",
      customer_address: formatCustomerAddress(parseLeadServiceAddress(lead.notes, lead.metadata)),
      company_name: company.name,
      companyName: company.name,
      booking_link: bookingLink,
      estimate_range: rangeLabel,
      company_phone: company.phone ?? "",
    },
  });
}
