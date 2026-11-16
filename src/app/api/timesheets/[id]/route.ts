import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";
import { prisma } from "@/lib/prisma";
import { computeEntryDurationHours } from "@/lib/timesheets/clock";
import { validateTimesheetCorrection } from "@/lib/timesheets/edit";
import { canEditTimesheets } from "@/lib/timesheets/permissions";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canEditTimesheets(user.role)) return forbiddenResponse();

    const { id } = await params;
    const existing = await prisma.timeClockEntry.findFirst({
      where: { id, companyId: user.companyId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Timesheet entry not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as {
      clockInAt?: string;
      clockOutAt?: string | null;
      reason?: string;
    };
    if (typeof body.clockInAt !== "string" || !body.clockInAt.trim()) {
      return badRequestResponse("Clock-in time is required");
    }
    if (
      body.clockOutAt === undefined ||
      (body.clockOutAt !== null && typeof body.clockOutAt !== "string")
    ) {
      return badRequestResponse("Clock-out time must be a date or explicitly left blank");
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return badRequestResponse("Enter a reason for this correction");
    if (reason.length > 500) return badRequestResponse("Correction reason is too long");

    const clockInAt = new Date(body.clockInAt);
    const clockOutAt = body.clockOutAt ? new Date(body.clockOutAt) : null;
    const validationError = validateTimesheetCorrection(clockInAt, clockOutAt);
    if (validationError) return badRequestResponse(validationError);

    const overlap = await prisma.timeClockEntry.findFirst({
      where: {
        id: { not: existing.id },
        companyId: user.companyId,
        userId: existing.userId,
        clockInAt: { lt: clockOutAt ?? new Date("9999-12-31T23:59:59.999Z") },
        OR: [{ clockOutAt: null }, { clockOutAt: { gt: clockInAt } }],
      },
      select: { id: true },
    });
    if (overlap) {
      return NextResponse.json(
        { error: "This correction overlaps another shift for this employee" },
        { status: 409 }
      );
    }

    const updated = await prisma.timeClockEntry.update({
      where: { id: existing.id },
      data: { clockInAt, clockOutAt },
    });

    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "TimeClockEntry",
      entityId: existing.id,
      action: "CORRECT",
      field: "clockInAt,clockOutAt",
      before: {
        clockInAt: existing.clockInAt.toISOString(),
        clockOutAt: existing.clockOutAt?.toISOString() ?? null,
      },
      after: {
        clockInAt: updated.clockInAt.toISOString(),
        clockOutAt: updated.clockOutAt?.toISOString() ?? null,
        reason,
      },
    });

    return NextResponse.json({
      entry: {
        id: updated.id,
        userId: existing.user.id,
        userName: existing.user.name,
        clockInAt: updated.clockInAt.toISOString(),
        clockOutAt: updated.clockOutAt?.toISOString() ?? null,
        durationHours: computeEntryDurationHours(updated),
        inProgress: updated.clockOutAt == null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Timesheet correction failed", error);
    return NextResponse.json({ error: "Failed to correct timesheet entry" }, { status: 500 });
  }
}
