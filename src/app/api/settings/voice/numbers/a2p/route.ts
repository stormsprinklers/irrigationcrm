import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  companiesHaveA2pCampaign,
  getA2pStatusForCompanies,
  listUserOperatedCompanyIds,
  saveCompanyMessagingServiceSid,
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
 * PATCH — Save a company campaign SID, or the shared fallback Messaging Service.
 * Body: { messagingServiceSid: "MG…" | null, companyId?: string }
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
    const companyId = body.companyId ? String(body.companyId).trim() : "";

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

    let saved: string | null;
    if (companyId) {
      if (!companyIds.includes(companyId)) {
        return forbiddenResponse();
      }
      saved = await saveCompanyMessagingServiceSid({
        companyId,
        messagingServiceSid,
      });
    } else {
      saved = await saveSharedMessagingServiceSid({
        messagingServiceSid,
        updatedByUserId: user.id,
      });
    }

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
 * POST — Attach unlocked Twilio-linked numbers for this admin’s operated businesses
 * to each company’s A2P Messaging Service (shared fallback if a company has none).
 */
export async function POST() {
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
    if (!(await companiesHaveA2pCampaign(companyIds))) {
      return NextResponse.json(
        {
          error:
            "Choose a Messaging Service for each company on the A2P campaign tab before attaching numbers.",
        },
        { status: 503 }
      );
    }
    const result = await syncCompaniesNumbersToA2p(companyIds);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "A2P sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
