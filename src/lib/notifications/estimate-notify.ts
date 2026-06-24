import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import { buildNotificationContext } from "./context";
import { sendOperationalNotification } from "./send";

export async function notifyEstimateViaTemplates(estimateId: string, companyId: string) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId },
    include: { customer: true, company: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate?.customer) return { emailSent: false, smsSent: false, skipped: ["no customer"] };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const portalSlug = estimate.company.portalSlug ?? estimate.company.bookingSlug;
  const estimateUrl = portalSlug
    ? `${appUrl}/portal/${portalSlug}/estimates/${estimate.publicToken}`
    : `${appUrl}/estimates/${estimate.id}`;

  const context = buildNotificationContext({
    company: estimate.company,
    customer: estimate.customer,
    estimate: { publicToken: estimate.publicToken },
    estimateUrl,
  });

  return sendOperationalNotification({
    companyId,
    event: "ESTIMATE_SENT",
    recipient: {
      customerId: estimate.customerId,
      name: estimate.customer.name,
      email: estimate.customer.email,
      phone: estimate.customer.phone,
    },
    context: {
      ...context,
      estimate_amount: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(toNumber(estimate.total)),
    },
    options: {
      estimateId: estimate.id,
      linkPlaceholders: { estimate: estimateUrl },
    },
  });
}
