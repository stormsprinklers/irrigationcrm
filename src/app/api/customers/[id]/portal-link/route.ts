import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, badRequestResponse } from "@/lib/api-auth";
import { getCompanyByPortalSlug, resolvePortalSlug } from "@/lib/portal/company";
import { requestPortalLoginLink } from "@/lib/portal/login";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!customer.email) return badRequestResponse("Customer must have an email address");

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        name: true,
        portalEnabled: true,
        portalSlug: true,
        bookingSlug: true,
        sendgridFrom: true,
        emailSenderName: true,
        emailLogoUrl: true,
      },
    });
    if (!company?.portalEnabled) {
      return badRequestResponse("Customer portal is not enabled");
    }

    const slug = resolvePortalSlug(company);
    if (!slug) return badRequestResponse("Portal slug is not configured");

    const portalCompany = await getCompanyByPortalSlug(slug);
    if (!portalCompany) return badRequestResponse("Portal is not available");

    await requestPortalLoginLink({
      companyId: company.id,
      companyName: company.name,
      slug,
      customerId: customer.id,
      email: customer.email,
      sendgridFrom: company.sendgridFrom,
      emailSenderName: company.emailSenderName,
      emailLogoUrl: company.emailLogoUrl,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const commsDisabled = outboundCommsErrorResponse(err);
    if (commsDisabled) return commsDisabled;
    if (err instanceof Error && err.message.includes("Too many")) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : "Failed to send portal link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
