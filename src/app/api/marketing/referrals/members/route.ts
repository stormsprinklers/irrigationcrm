import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { enrollReferralMember } from "@/lib/referrals/members";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

    const result = await enrollReferralMember({
      companyId: user.companyId,
      customerId,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({
      memberId: result.member.id,
      token: result.member.token,
      shareUrl: result.shareUrl,
      created: result.created,
      enrolledAt: result.member.enrolledAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to enroll member";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
