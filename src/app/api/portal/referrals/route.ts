import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { enrollReferralMember } from "@/lib/referrals/members";
import { createReferralSubmission } from "@/lib/referrals/submissions";
import { buildReferralShareUrl } from "@/lib/referrals/utils";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "referrals")) {
    return portalForbiddenResponse("Referrals are not available in the portal");
  }

  const member = await prisma.referralMember.findUnique({
    where: { customerId: ctx.customerId },
  });

  const settings = await prisma.referralProgramSettings.findUnique({
    where: { companyId: ctx.companyId },
    select: { enabled: true, headline: true, terms: true, installRewardCents: true, serviceRewardCents: true },
  });

  const submissions = await prisma.referralSubmission.findMany({
    where: { companyId: ctx.companyId, referrerCustomerId: ctx.customerId },
    include: { reward: { select: { status: true, amountCents: true, paidAt: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const shareUrl =
    member && ctx.company.portalSlug
      ? buildReferralShareUrl({
          portalSlug: ctx.company.portalSlug,
          memberToken: member.token,
        })
      : null;

  return NextResponse.json({
    programEnabled: Boolean(settings?.enabled),
    enrolled: Boolean(member),
    member: member
      ? {
          id: member.id,
          enrolledAt: member.enrolledAt.toISOString(),
          stripeConnectOnboarded: Boolean(member.stripeConnectOnboardedAt),
          shareUrl,
        }
      : null,
    settings: settings
      ? {
          headline: settings.headline,
          terms: settings.terms,
          installRewardCents: settings.installRewardCents,
          serviceRewardCents: settings.serviceRewardCents,
        }
      : null,
    submissions: submissions.map((s) => ({
      id: s.id,
      referredName: s.referredName,
      status: s.status,
      rewardCents: s.rewardCents,
      rewardStatus: s.reward?.status ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "referrals")) {
    return portalForbiddenResponse("Referrals are not available in the portal");
  }

  let member = await prisma.referralMember.findUnique({
    where: { customerId: ctx.customerId },
  });

  if (!member) {
    const enrolled = await enrollReferralMember({
      companyId: ctx.companyId,
      customerId: ctx.customerId,
      origin: request.nextUrl.origin,
    });
    member = enrolled.member;
  }

  const body = await request.json();
  const referredName = typeof body.name === "string" ? body.name : "";
  if (!referredName.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const result = await createReferralSubmission({
      companyId: ctx.companyId,
      memberToken: member.token,
      input: {
        referredName,
        referredPhone: typeof body.phone === "string" ? body.phone : null,
        referredEmail: typeof body.email === "string" ? body.email : null,
        referredAddress: typeof body.address === "string" ? body.address : null,
        referredCity: typeof body.city === "string" ? body.city : null,
        referredState: typeof body.state === "string" ? body.state : null,
        referredZip: typeof body.zip === "string" ? body.zip : null,
      },
    });

    return NextResponse.json({
      ok: true,
      submissionId: result.submission.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit referral";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
