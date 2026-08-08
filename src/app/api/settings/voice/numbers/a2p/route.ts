import { NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
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
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: {
        id: true,
        name: true,
        _count: { select: { phoneNumbers: true } },
      },
      orderBy: { name: "asc" },
    });

    const linkedNumbers = await prisma.phoneNumber.count({
      where: { companyId: { in: companyIds }, twilioSid: { not: null } },
    });

    return NextResponse.json({
      configured: isA2pMessagingConfigured(),
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || null,
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        phoneNumberCount: c._count.phoneNumbers,
      })),
      twilioLinkedCount: linkedNumbers,
    });
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
    if (user.role !== "ADMIN") {
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
