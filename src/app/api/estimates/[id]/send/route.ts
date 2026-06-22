import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

type Params = { params: Promise<{ id: string }> };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        customer: true,
        company: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!estimate.customer.email) {
      return badRequestResponse("Customer must have an email address to send estimate");
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "Twilio email is not configured" }, { status: 503 });
    }

    const branding = {
      companyName: estimate.company.name,
      sendgridFrom: estimate.company.sendgridFrom,
      emailSenderName: estimate.company.emailSenderName,
      emailLogoUrl: estimate.company.emailLogoUrl,
    };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const estimateUrl = `${appUrl}/estimates/${estimate.id}`;
    const lineItemsHtml = estimate.lineItems
      .map(
        (item) =>
          `<tr><td>${item.name}</td><td>${toNumber(item.quantity)}</td><td>${formatCurrency(toNumber(item.unitPrice))}</td><td>${formatCurrency(toNumber(item.total))}</td></tr>`
      )
      .join("");

    await sendCompanyEmail(branding, {
      to: [estimate.customer.email],
      subject: `Estimate from ${estimate.company.name}`,
      text: `Hi ${estimate.customer.name},\n\nPlease review your estimate totaling ${formatCurrency(toNumber(estimate.total))}.\n\nView estimate: ${estimateUrl}\n\n— ${estimate.company.name}`,
      html: `<p>Hi ${estimate.customer.name},</p><p>Please review your estimate totaling <strong>${formatCurrency(toNumber(estimate.total))}</strong>.</p><table border="1" cellpadding="8" cellspacing="0"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${lineItemsHtml}</tbody></table><p><a href="${estimateUrl}">View estimate</a></p><p>— ${estimate.company.name}</p>`,
    });

    await prisma.estimate.update({
      where: { id },
      data: { status: EstimateStatus.SENT },
    });

    const updated = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(updated);
  } catch {
    return unauthorizedResponse();
  }
}
