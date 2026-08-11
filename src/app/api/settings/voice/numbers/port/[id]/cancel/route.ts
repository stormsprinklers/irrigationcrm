import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serializePortIn } from "@/lib/twilio/port-in-service";
import {
  cancelPortInPhoneNumber,
  cancelPortInRequest,
} from "@/lib/twilio/porting";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Ctx) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const row = await prisma.twilioPortInRequest.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const statusLower = row.status.toLowerCase();
    if (
      statusLower.includes("completed") ||
      statusLower.includes("canceled") ||
      statusLower.includes("cancelled")
    ) {
      return NextResponse.json(
        { error: `Cannot cancel a port in status "${row.status}"` },
        { status: 400 }
      );
    }

    try {
      if (row.twilioPortInPhoneNumberSid) {
        await cancelPortInPhoneNumber(
          row.twilioPortInRequestSid,
          row.twilioPortInPhoneNumberSid
        );
      } else {
        await cancelPortInRequest(row.twilioPortInRequestSid);
      }
    } catch (err) {
      // Fall back to canceling the whole request
      try {
        await cancelPortInRequest(row.twilioPortInRequestSid);
      } catch {
        throw err;
      }
    }

    // If the whole Twilio request was canceled (no per-number SID), mark siblings too.
    if (!row.twilioPortInPhoneNumberSid) {
      await prisma.twilioPortInRequest.updateMany({
        where: {
          companyId: user.companyId,
          twilioPortInRequestSid: row.twilioPortInRequestSid,
        },
        data: { status: "Canceled" },
      });
    }

    const updated = await prisma.twilioPortInRequest.update({
      where: { id: row.id },
      data: { status: "Canceled" },
      include: {
        phoneNumber: { select: { id: true, e164: true, isPrimary: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(serializePortIn(updated));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Failed to cancel port request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
