import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";
import { buildEstimateOptionPdfs, pdfEmailAttachment } from "@/lib/pdf/customer-documents";
import { buildNotificationContext } from "./context";
import { sendOperationalNotification, type SendResult } from "./send";

export type EstimateSendChannel = "email" | "sms";

export async function notifyEstimateViaTemplates(
  estimateId: string,
  companyId: string,
  channel?: EstimateSendChannel
): Promise<SendResult> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId },
    include: { customer: true, company: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate?.customer) {
    return { emailSent: false, smsSent: false, skipped: ["no customer"], deliveryIds: [] };
  }

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

  let emailAttachments: Array<{ filename: string; contentType: string; content: string }> | undefined;
  if (channel !== "sms") {
    try {
      const pdfs = await buildEstimateOptionPdfs(estimate.id, companyId);
      if (pdfs.length) {
        emailAttachments = pdfs.map((pdf) => pdfEmailAttachment(pdf.filename, pdf.buffer));
      }
    } catch (err) {
      console.error("Estimate PDF failed:", err);
    }
  }

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
      emailAttachments,
      ...(channel === "email" ? { emailOnly: true } : {}),
      ...(channel === "sms" ? { smsOnly: true } : {}),
    },
  });
}

/** Staff-facing portal path for the customer estimate page. */
export async function getEstimateCustomerPortalPath(
  companyId: string,
  estimateId: string
): Promise<string | null> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId },
    select: {
      publicToken: true,
      company: { select: { portalSlug: true, bookingSlug: true } },
    },
  });
  if (!estimate) return null;
  const slug = estimate.company.portalSlug ?? estimate.company.bookingSlug;
  if (!slug) return null;
  return `/portal/${slug}/estimates/${estimate.publicToken}`;
}
