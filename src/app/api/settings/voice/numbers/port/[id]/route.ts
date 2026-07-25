import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  refreshPortInFromTwilio,
  serializePortIn,
} from "@/lib/twilio/port-in-service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const row = await prisma.twilioPortInRequest.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        phoneNumber: { select: { id: true, e164: true, isPrimary: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Best-effort refresh from Twilio on detail load
    try {
      const refreshed = await refreshPortInFromTwilio(user.companyId, id);
      if (refreshed) return NextResponse.json(serializePortIn(refreshed));
    } catch (err) {
      console.warn("[porting] refresh on GET failed", err);
    }

    return NextResponse.json(serializePortIn(row));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Failed to load port request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
