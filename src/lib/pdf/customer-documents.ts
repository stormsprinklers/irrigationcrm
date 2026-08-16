import { fetchBlobBytes } from "@/lib/blob/download";
import { prisma } from "@/lib/prisma";
import { serializePortalEstimate } from "@/lib/portal/serializers";
import { toNumber } from "@/lib/visits/totals";
import { jpegDimensions, SimplePdf, formatCompanyAddress, money } from "@/lib/pdf/layout-pdf";

type CompanyBrand = {
  name: string;
  phone?: string | null;
  supportEmail?: string | null;
  sendgridFrom?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  emailLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  invoiceFooter?: string | null;
  invoiceTerms?: string | null;
  estimateWarrantyText?: string | null;
  googleReviewUrl?: string | null;
};

async function logoJpeg(url: string | null | undefined) {
  if (!url) return null;
  try {
    const { buffer, mimeType } = await fetchBlobBytes(url);
    if (!mimeType.includes("jpeg") && !mimeType.includes("jpg") && !jpegDimensions(buffer)) {
      return null;
    }
    return jpegDimensions(buffer) ? buffer : null;
  } catch {
    return null;
  }
}

function addCompanyHeader(pdf: SimplePdf, company: CompanyBrand, eyebrow: string) {
  pdf.addMuted(eyebrow);
  pdf.addHeading(company.name);
  const contact = [
    formatCompanyAddress(company),
    company.phone,
    company.supportEmail || company.sendgridFrom,
    company.website,
  ].filter(Boolean);
  if (contact.length) pdf.addMuted(contact.join("  |  "));
  pdf.addRule();
}

export async function buildEstimatePdf(estimateId: string, companyId: string): Promise<Buffer | null> {
  const built = await loadEstimateForPdf(estimateId, companyId);
  if (!built) return null;
  return renderEstimatePdf(built, null);
}

export async function buildEstimateOptionPdfs(
  estimateId: string,
  companyId: string
): Promise<Array<{ filename: string; buffer: Buffer }>> {
  const built = await loadEstimateForPdf(estimateId, companyId);
  if (!built) return [];
  const options = built.view.options ?? [];
  const companySlug = built.estimate.company.name.replace(/[^\w]+/g, "-");
  if (options.length <= 1) {
    const buffer = await renderEstimatePdf(built, options[0]?.id ?? null);
    return buffer
      ? [{ filename: `Proposal-from-${companySlug}.pdf`, buffer }]
      : [];
  }
  const out: Array<{ filename: string; buffer: Buffer }> = [];
  for (const option of [...options].sort((a, b) => b.total - a.total)) {
    const buffer = await renderEstimatePdf(built, option.id);
    if (!buffer) continue;
    const label = option.label.replace(/[^\w]+/g, "-") || "Option";
    out.push({ filename: `Proposal-${label}-${companySlug}.pdf`, buffer });
  }
  return out;
}

async function loadEstimateForPdf(estimateId: string, companyId: string) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId },
    include: {
      customer: true,
      company: true,
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { priceBookItem: { select: { type: true } } },
      },
      options: { orderBy: { sortOrder: "asc" } },
      discounts: true,
      visit: {
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          assignedUser: { select: { name: true, photoUrl: true, title: true } },
        },
      },
    },
  });
  if (!estimate?.customer) return null;
  const view = serializePortalEstimate({
    ...estimate,
    company: { estimateWarrantyText: estimate.company.estimateWarrantyText },
  });
  return { estimate, view };
}

async function renderEstimatePdf(
  built: NonNullable<Awaited<ReturnType<typeof loadEstimateForPdf>>>,
  optionId: string | null
): Promise<Buffer | null> {
  const { estimate, view } = built;
  const pdf = new SimplePdf(estimate.company.brandPrimaryColor);
  const logo = await logoJpeg(estimate.company.emailLogoUrl);
  if (logo) pdf.addJpeg(logo);

  addCompanyHeader(pdf, estimate.company, "Proposal");
  pdf.addHeading(`Proposal from ${estimate.company.name}`);
  pdf.addMuted(`Prepared for ${estimate.customer.name}`);
  if (view.visit?.technician) {
    pdf.addMuted(
      `${view.visit.technician.name}${view.visit.technician.title ? ` · ${view.visit.technician.title}` : ""}`
    );
  }
  if (view.expiresAt) {
    pdf.addMuted(`Expires ${new Date(view.expiresAt).toLocaleDateString()}`);
  }
  pdf.addRule();

  const options = view.options ?? [];
  const items = view.lineItems ?? [];
  const discounts = view.discounts ?? [];
  const sections =
    optionId
      ? options.filter((option) => option.id === optionId)
      : options.length > 1
        ? options
        : [
            {
              id: options[0]?.id ?? null,
              label: options[0]?.label || "Line items",
              total: view.total,
              subtotal: view.subtotal,
              discountTotal: view.discountTotal,
              description: options[0]?.description ?? null,
              photoUrl: options[0]?.photoUrl ?? null,
            },
          ];

  for (const section of sections) {
    const sectionItems = items.filter((item) =>
      item.optionId === section.id || (!item.optionId && options.length <= 1)
    );
    pdf.addSubheading(section.label || "Line items");
    if ("description" in section && section.description) {
      pdf.addBody(String(section.description));
    }
    if (!sectionItems.length) {
      pdf.addMuted("No line items on this option.");
    }
    for (const item of sectionItems) {
      const qty =
        item.quantity === 1 && (!item.unit || item.unit === "each")
          ? item.name
          : `${item.name} (Qty ${item.quantity}${item.unit ? ` ${item.unit}` : ""})`;
      pdf.addRow(qty, money(item.total));
      if (item.description) pdf.addMuted(item.description);
    }
    const sectionDiscounts = discounts.filter((d) =>
      d.optionId === section.id || (!d.optionId && options.length <= 1)
    );
    for (const discount of sectionDiscounts) {
      const amount =
        discount.type === "PERCENT" ? `${discount.amount}%` : money(discount.amount);
      pdf.addRow(discount.label?.trim() || "Discount", `-${amount}`);
    }
    pdf.addRow("Total", money(section.total), true);
    pdf.addRule();
  }

  if (view.hasDesign || view.hasHolidayLighting) {
    pdf.addMuted("A design preview is included on the online proposal.");
  }

  const warranty = view.warrantyText || estimate.company.estimateWarrantyText;
  if (warranty) {
    pdf.addSubheading("Warranty");
    pdf.addBody(warranty);
  }

  if (estimate.depositRequired) {
    pdf.addMuted("A deposit is required to approve this proposal. Approve online to pay the deposit.");
  }

  return pdf.toBuffer();
}

export async function buildReceiptPdf(params: {
  invoiceId: string;
  companyId: string;
  workSummary?: string | null;
  reviewUrl?: string | null;
}): Promise<Buffer | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: params.companyId },
    include: {
      customer: true,
      company: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
      visit: {
        include: {
          attachments: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!invoice?.customer) return null;

  const pdf = new SimplePdf(invoice.company.brandPrimaryColor);
  const logo = await logoJpeg(invoice.company.emailLogoUrl);
  if (logo) pdf.addJpeg(logo);

  addCompanyHeader(pdf, invoice.company, "Payment receipt");
  pdf.addHeading("Payment receipt");
  pdf.addMuted(`Invoice ${invoice.invoiceNumber}`);
  pdf.addMuted(`Billed to ${invoice.customer.name}`);
  if (invoice.paidAt) {
    pdf.addMuted(`Paid ${invoice.paidAt.toLocaleString()}`);
  }
  pdf.addRule();

  pdf.addSubheading("Charges");
  for (const item of invoice.lineItems) {
    const label =
      toNumber(item.quantity) === 1 ? item.name : `${item.name} x ${toNumber(item.quantity)}`;
    pdf.addRow(label, money(toNumber(item.total)));
    if (item.description) pdf.addMuted(item.description);
  }
  if (toNumber(invoice.discountTotal) > 0) {
    pdf.addRow("Discounts", `-${money(toNumber(invoice.discountTotal))}`);
  }
  if (toNumber(invoice.tax) > 0) {
    pdf.addRow("Tax", money(toNumber(invoice.tax)));
  }
  pdf.addRow("Total", money(toNumber(invoice.total)), true);

  const payments = invoice.payments.filter((p) => !p.refundedAt);
  if (payments.length) {
    pdf.addSubheading("Payments");
    for (const payment of payments) {
      pdf.addRow(
        `${payment.method} · ${payment.paidAt.toLocaleDateString()}`,
        money(toNumber(payment.amount))
      );
    }
  }

  if (params.workSummary) {
    pdf.addSubheading("Summary of work");
    pdf.addBody(params.workSummary);
  }

  const media = (invoice.visit?.attachments ?? []).filter((a) => a.mimeType.startsWith("image/"));
  if (media.length) {
    pdf.addSubheading("Photos from the job");
    let added = 0;
    for (const item of media) {
      if (added >= 4) break;
      try {
        const { buffer } = await fetchBlobBytes(item.blobUrl);
        if (pdf.addJpeg(buffer, item.fileName)) added += 1;
      } catch {
        pdf.addMuted(item.fileName);
      }
    }
  }

  const videos = (invoice.visit?.attachments ?? []).filter((a) => a.mimeType.startsWith("video/"));
  if (videos.length) {
    pdf.addMuted("Videos from this visit are available in the email and customer portal.");
  }

  if (params.reviewUrl) {
    pdf.addSubheading("Leave a review");
    pdf.addBody(params.reviewUrl);
  }

  if (invoice.company.invoiceTerms) {
    pdf.addSubheading("Terms");
    pdf.addBody(invoice.company.invoiceTerms);
  }
  if (invoice.company.invoiceFooter) {
    pdf.addMuted(invoice.company.invoiceFooter);
  }

  return pdf.toBuffer();
}

export function pdfEmailAttachment(filename: string, buffer: Buffer) {
  return {
    filename,
    contentType: "application/pdf",
    content: buffer.toString("base64"),
  };
}
