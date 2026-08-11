import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  getA2pStatusForCompanies,
  isA2pMessagingConfigured,
  listUserOperatedCompanyIds,
  syncCompaniesNumbersToA2p,
} from "@/lib/twilio/a2p";

/** GET — A2P / Messaging Service status for this admin’s operated businesses. */
export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const sessionUser = await prisma.user.findFirst({
      where: { id: user.id },
      select: { email: true },
    });
    if (!sessionUser) return unauthorizedResponse();

    const companyIds = await listUserOperatedCompanyIds(
      user.id,
      sessionUser.email,
      user.companyId
    );
    const status = await getA2pStatusForCompanies(companyIds);
    return NextResponse.json(status);
  } catch {
    return unauthorizedResponse();
  }
}

/**
 * POST — Attach all Twilio-linked numbers for this admin’s operated businesses
 * (current company + same-email / account-linked companies) to the shared A2P Messaging Service.
 */
export async function POST() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }
    if (!isA2pMessagingConfigured()) {
      return NextResponse.json(
        {
          error:
            "Set TWILIO_MESSAGING_SERVICE_SID to your approved A2P Messaging Service SID",
        },
        { status: 503 }
      );
    }

    const sessionUser = await prisma.user.findFirst({
      where: { id: user.id },
      select: { email: true },
    });
    if (!sessionUser) return unauthorizedResponse();

    const companyIds = await listUserOperatedCompanyIds(
      user.id,
      sessionUser.email,
      user.companyId
    );
    const result = await syncCompaniesNumbersToA2p(companyIds);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "A2P sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
