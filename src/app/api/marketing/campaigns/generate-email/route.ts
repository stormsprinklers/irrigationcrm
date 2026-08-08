import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";
import { resolveCampaignAllowedLinks } from "@/lib/marketing/campaign-links";
import { generateCampaignEmail } from "@/lib/marketing/email-ai";
import { isEmailTemplateId } from "@/lib/marketing/email-templates";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { prompt, subject, existingHtml, brandPalette, templateId, imageUrls } = body;

    if (!prompt?.trim()) {
      return badRequestResponse("prompt is required");
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        name: true,
        emailLogoUrl: true,
        bookingSlug: true,
        websiteBaseUrl: true,
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
      bookingSlug: company.bookingSlug,
      websiteBaseUrl: company.websiteBaseUrl,
      privacyPolicyUrl: company.privacyPolicyUrl,
      termsOfServiceUrl: company.termsOfServiceUrl,
    });

    const logoUrl = absolutePublicBlobUrl(company.emailLogoUrl) ?? company.emailLogoUrl;
    const images = Array.isArray(imageUrls)
      ? imageUrls.map(String).filter(Boolean).slice(0, 6)
      : [];

    const result = await generateCampaignEmail({
      prompt: String(prompt),
      subject: subject ? String(subject) : undefined,
      companyName: company.name,
      existingHtml: existingHtml ? String(existingHtml) : undefined,
      templateId: isEmailTemplateId(templateId) ? templateId : null,
      allowedLinks,
      imageUrls: images,
      logoUrl,
      brandPalette:
        brandPalette && typeof brandPalette === "object"
          ? {
              primary: String((brandPalette as { primary?: string }).primary ?? ""),
              secondary: String((brandPalette as { secondary?: string }).secondary ?? ""),
              soft: String((brandPalette as { soft?: string }).soft ?? ""),
              panel: String((brandPalette as { panel?: string }).panel ?? ""),
              accent:
                (brandPalette as { accent?: string | null }).accent != null
                  ? String((brandPalette as { accent?: string | null }).accent)
                  : null,
              extras: Array.isArray((brandPalette as { extras?: unknown }).extras)
                ? ((brandPalette as { extras: unknown[] }).extras.map(String) as string[])
                : undefined,
            }
          : undefined,
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
