import { NextRequest, NextResponse } from "next/server";
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
  saveSharedMessagingServiceSid,
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
 * PATCH — Save the shared Messaging Service SID chosen in the A2P settings UI.
 * Body: { messagingServiceSid: "MG…" | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const body = await request.json().catch(() => ({}));
    const raw = body.messagingServiceSid;
    const messagingServiceSid =
      raw === null || raw === undefined || raw === ""
        ? null
        : String(raw).trim();

    const saved = await saveSharedMessagingServiceSid({
      messagingServiceSid,
      updatedByUserId: user.id,
    });

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
    return NextResponse.json({ ...status, savedMessagingServiceSid: saved });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Failed to save Messaging Service";
    return NextResponse.json({ error: message }, { status: 400 });
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
    if (!(await isA2pMessagingConfigured())) {
      return NextResponse.json(
        {
          error:
            "Choose a Messaging Service on the A2P campaign tab before attaching numbers.",
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
