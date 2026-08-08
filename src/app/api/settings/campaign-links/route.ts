import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  parseCampaignCtaLinks,
  resolveCampaignAllowedLinks,
  sanitizeCampaignCtaLinksInput,
} from "@/lib/marketing/campaign-links";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
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

    const stored = parseCampaignCtaLinks(company.campaignCtaLinks);
    const allowedLinks = resolveCampaignAllowedLinks({
      campaignCtaLinks: company.campaignCtaLinks,
      bookingSlug: company.bookingSlug,
      websiteBaseUrl: company.websiteBaseUrl,
      privacyPolicyUrl: company.privacyPolicyUrl,
      termsOfServiceUrl: company.termsOfServiceUrl,
    });

    return NextResponse.json({
      bookingUrl: stored.bookingUrl ?? "",
      bookingSlug: company.bookingSlug,
      privacyPolicyUrl: company.privacyPolicyUrl ?? "",
      termsOfServiceUrl: company.termsOfServiceUrl ?? "",
      custom: stored.custom ?? [],
      allowedLinks,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json().catch(() => ({}))) as {
      bookingUrl?: string | null;
      privacyPolicyUrl?: string | null;
      termsOfServiceUrl?: string | null;
      custom?: Array<{ id?: string; label?: string; url?: string }>;
    };

    const stored = sanitizeCampaignCtaLinksInput({
      bookingUrl: body.bookingUrl,
      custom: body.custom,
    });

    for (const link of stored.custom ?? []) {
      try {
        // eslint-disable-next-line no-new
        new URL(link.url);
      } catch {
        return badRequestResponse(`Invalid URL for "${link.label}"`);
      }
    }
    if (stored.bookingUrl) {
      try {
        // eslint-disable-next-line no-new
        new URL(stored.bookingUrl);
      } catch {
        return badRequestResponse("Invalid booking URL");
      }
    }

    const privacy =
      typeof body.privacyPolicyUrl === "string" ? body.privacyPolicyUrl.trim() : undefined;
    const terms =
      typeof body.termsOfServiceUrl === "string" ? body.termsOfServiceUrl.trim() : undefined;

    if (privacy) {
      try {
        // eslint-disable-next-line no-new
        new URL(privacy);
      } catch {
        return badRequestResponse("Invalid privacy policy URL");
      }
    }
    if (terms) {
      try {
        // eslint-disable-next-line no-new
        new URL(terms);
      } catch {
        return badRequestResponse("Invalid terms of service URL");
      }
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        campaignCtaLinks: stored,
        ...(privacy !== undefined ? { privacyPolicyUrl: privacy || null } : {}),
        ...(terms !== undefined ? { termsOfServiceUrl: terms || null } : {}),
      },
      select: {
        bookingSlug: true,
        websiteBaseUrl: true,
        privacyPolicyUrl: true,
        termsOfServiceUrl: true,
        campaignCtaLinks: true,
      },
    });

    const parsed = parseCampaignCtaLinks(company.campaignCtaLinks);
    return NextResponse.json({
      bookingUrl: parsed.bookingUrl ?? "",
      bookingSlug: company.bookingSlug,
      privacyPolicyUrl: company.privacyPolicyUrl ?? "",
      termsOfServiceUrl: company.termsOfServiceUrl ?? "",
      custom: parsed.custom ?? [],
      allowedLinks: resolveCampaignAllowedLinks({
        campaignCtaLinks: company.campaignCtaLinks,
        bookingSlug: company.bookingSlug,
        websiteBaseUrl: company.websiteBaseUrl,
        privacyPolicyUrl: company.privacyPolicyUrl,
        termsOfServiceUrl: company.termsOfServiceUrl,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
