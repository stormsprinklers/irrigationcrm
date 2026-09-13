import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";
import { resolveCampaignAllowedLinks } from "@/lib/marketing/campaign-links";
import { generateCampaignEmail } from "@/lib/marketing/email-ai";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { prompt, subject, existingText } = body;

    if (!prompt?.trim()) {
      return badRequestResponse("prompt is required");
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        name: true,
        emailLogoUrl: true,
        phone: true,
        supportEmail: true,
        website: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        bookingSlug: true,
        websiteBookingUrl: true,
        websiteWinterizationBookingUrl: true,
        customerBaseUrl: true,
        privacyPolicyUrl: true,
        termsOfServiceUrl: true,
        campaignCtaLinks: true,
      },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const allowedLinks = resolveCampaignAllowedLinks({
      campaignCtaLinks: company.campaignCtaLinks,
      websiteBookingUrl: company.websiteBookingUrl,
      websiteWinterizationBookingUrl: company.websiteWinterizationBookingUrl,
      bookingSlug: company.bookingSlug,
      customerBaseUrl: company.customerBaseUrl,
      privacyPolicyUrl: company.privacyPolicyUrl,
      termsOfServiceUrl: company.termsOfServiceUrl,
    });

    const logoUrl = absolutePublicBlobUrl(company.emailLogoUrl) ?? company.emailLogoUrl;

    const result = await generateCampaignEmail({
      prompt: String(prompt),
      subject: subject ? String(subject) : undefined,
      companyName: company.name,
      existingText: existingText ? String(existingText) : undefined,
      templateId: "plain",
      allowedLinks,
      imageUrls: [],
      logoUrl,
      companyPhone: company.phone,
      companyEmail: company.supportEmail,
      companyWebsite: company.website,
      companyAddress: company.address,
      companyCity: company.city,
      companyState: company.state,
      companyZip: company.zip,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
