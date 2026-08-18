import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canWriteCompanySettings } from "@/lib/settings/access";
import {
  parseCampaignCtaLinks,
  resolveCampaignAllowedLinks,
  sanitizeCampaignCtaLinksInput,
} from "@/lib/marketing/campaign-links";
import { normalizePhone } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

async function buildResponse(companyId: string) {
  const [company, phoneNumbers] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        bookingSlug: true,
        websiteBaseUrl: true,
        privacyPolicyUrl: true,
        termsOfServiceUrl: true,
        campaignCtaLinks: true,
        twilioPhone: true,
        sendgridFrom: true,
        marketingTwilioPhone: true,
        marketingSendgridFrom: true,
      },
    }),
    prisma.phoneNumber.findMany({
      where: { companyId },
      select: {
        id: true,
        e164: true,
        friendlyName: true,
        isPrimary: true,
        smsEnabled: true,
      },
      orderBy: [{ isPrimary: "desc" }, { e164: "asc" }],
    }),
  ]);
  if (!company) return null;

  const stored = parseCampaignCtaLinks(company.campaignCtaLinks);
  return {
    bookingUrl: stored.bookingUrl ?? "",
    bookingSlug: company.bookingSlug,
    privacyPolicyUrl: company.privacyPolicyUrl ?? "",
    termsOfServiceUrl: company.termsOfServiceUrl ?? "",
    custom: stored.custom ?? [],
    allowedLinks: resolveCampaignAllowedLinks({
      campaignCtaLinks: company.campaignCtaLinks,
      bookingSlug: company.bookingSlug,
      websiteBaseUrl: company.websiteBaseUrl,
      privacyPolicyUrl: company.privacyPolicyUrl,
      termsOfServiceUrl: company.termsOfServiceUrl,
    }),
    marketingTwilioPhone: company.marketingTwilioPhone ?? "",
    marketingSendgridFrom: company.marketingSendgridFrom ?? "",
    fallbackTwilioPhone: company.twilioPhone,
    fallbackSendgridFrom: company.sendgridFrom,
    phoneNumbers,
  };
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    const payload = await buildResponse(user.companyId);
    if (!payload) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    return NextResponse.json(payload);
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
    if (!canWriteCompanySettings(user.role)) return forbiddenResponse();
    const body = (await request.json().catch(() => ({}))) as {
      bookingUrl?: string | null;
      privacyPolicyUrl?: string | null;
      termsOfServiceUrl?: string | null;
      custom?: Array<{ id?: string; label?: string; url?: string }>;
      marketingTwilioPhone?: string | null;
      marketingSendgridFrom?: string | null;
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

    let marketingTwilioPhone: string | null | undefined;
    if (body.marketingTwilioPhone !== undefined) {
      const raw = typeof body.marketingTwilioPhone === "string" ? body.marketingTwilioPhone.trim() : "";
      if (!raw) {
        marketingTwilioPhone = null;
      } else {
        const e164 = normalizePhone(raw);
        const owned = await prisma.phoneNumber.findFirst({
          where: { companyId: user.companyId, e164 },
          select: { id: true },
        });
        if (!owned) {
          return badRequestResponse("Select a phone number from your company phone list");
        }
        marketingTwilioPhone = e164;
      }
    }

    let marketingSendgridFrom: string | null | undefined;
    if (body.marketingSendgridFrom !== undefined) {
      const raw =
        typeof body.marketingSendgridFrom === "string" ? body.marketingSendgridFrom.trim() : "";
      if (!raw) {
        marketingSendgridFrom = null;
      } else {
        // Allow plain email or "Display Name <email@domain>"
        const angle = raw.match(/<([^>]+)>/);
        const email = (angle?.[1] ?? raw).trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return badRequestResponse("Invalid marketing from email");
        }
        marketingSendgridFrom = raw;
      }
    }

    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        campaignCtaLinks: stored,
        ...(privacy !== undefined ? { privacyPolicyUrl: privacy || null } : {}),
        ...(terms !== undefined ? { termsOfServiceUrl: terms || null } : {}),
        ...(marketingTwilioPhone !== undefined ? { marketingTwilioPhone } : {}),
        ...(marketingSendgridFrom !== undefined ? { marketingSendgridFrom } : {}),
      },
    });

    const payload = await buildResponse(user.companyId);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
