import { formatPartsListText } from "@/lib/design/parts-list";
import { buildPartsListPdf } from "@/lib/design/parts-list-pdf";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { prisma } from "@/lib/prisma";

export async function sendSupplierPartsList(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { company: true, customer: true },
  });
  if (!estimate?.company.supplierEmail) return;

  const bom = estimate.designInternalBom as Array<Record<string, unknown>> | null;
  const metadata = estimate.designExportMetadata as Record<string, unknown> | null;
  const manHours =
    typeof estimate.estimatedManHours === "number"
      ? estimate.estimatedManHours
      : typeof metadata?.estimatedManHours === "number"
        ? metadata.estimatedManHours
        : null;

  const body = formatPartsListText({
    projectName: String(metadata?.projectName ?? estimate.customer.name),
    bom: bom ?? [],
    manHours,
  });

  const branding = {
    companyName: estimate.company.name,
    sendgridFrom: estimate.company.sendgridFrom,
    emailSenderName: estimate.company.emailSenderName,
    emailLogoUrl: estimate.company.emailLogoUrl,
  };

  await sendCompanyEmail(branding, {
    to: [estimate.company.supplierEmail],
    subject: `Parts list — ${estimate.customer.name}`,
    text: body,
    html: `<p>Parts list for <strong>${estimate.customer.name}</strong>:</p><pre style="white-space:pre-wrap;font-family:monospace;font-size:13px">${body.replace(/</g, "&lt;")}</pre>`,
    attachments: [
      {
        filename: `parts-list-${estimate.id}.pdf`,
        contentType: "application/pdf",
        content: buildPartsListPdf({
          projectName: String(metadata?.projectName ?? estimate.customer.name),
          bom: bom ?? [],
          manHours,
        }).toString("base64"),
      },
    ],
  });
}
