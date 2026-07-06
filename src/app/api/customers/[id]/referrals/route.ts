import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildReferralShareUrl } from "@/lib/referrals/utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const member = await prisma.referralMember.findUnique({
      where: { customerId: id },
    });
    if (!member) {
      return NextResponse.json({ enrolled: false, shareUrl: null });
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { portalSlug: true },
    });

    const shareUrl =
      company?.portalSlug
        ? buildReferralShareUrl({ portalSlug: company.portalSlug, memberToken: member.token })
        : null;

    return NextResponse.json({
      enrolled: true,
      shareUrl,
      enrolledAt: member.enrolledAt.toISOString(),
    });
  } catch {
    return unauthorizedResponse();
  }
}
