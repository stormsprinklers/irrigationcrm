import { Division, UserRole, VisitStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  addZonedDays,
  formatInTimezone,
  startOfZonedDay,
} from "@/lib/datetime/zoned";
import { holidayVisitJobSummary, holidayVisitPlan } from "@/lib/holiday-lighting/visit-plan";
import { prisma } from "@/lib/prisma";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";

function canUseBulbPrepDashboard(role: string) {
  return role === UserRole.BULB_PREP;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uniqueJobNotes(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const note = value?.trim();
    if (!note || seen.has(note)) return [];
    seen.add(note);
    return [note];
  });
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canUseBulbPrepDashboard(user.role)) return forbiddenResponse();

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { timezone: true },
    });
    const timeZone = company?.timezone ?? "America/Denver";
    const start = startOfZonedDay(new Date(), timeZone);
    const end = addZonedDays(start, 90, timeZone);

    const visits = await prisma.visit.findMany({
      where: {
        companyId: user.companyId,
        division: Division.HOLIDAY_LIGHTS,
        status: {
          notIn: [
            VisitStatus.UNSCHEDULED,
            VisitStatus.COMPLETED,
            VisitStatus.CANCELLED,
          ],
        },
        startAt: { gte: start, lt: end },
      },
      orderBy: [{ startAt: "asc" }, { customer: { name: "asc" } }],
      select: {
        id: true,
        title: true,
        startAt: true,
        city: true,
        workSummary: true,
        designExportMetadata: true,
        bulbPrepCompletedAt: true,
        bulbPrepCompletedBy: { select: { name: true } },
        customer: { select: { name: true, city: true } },
        property: { select: { city: true } },
        lineItems: { select: { name: true, description: true } },
        notes: {
          orderBy: { createdAt: "asc" },
          select: { body: true },
        },
      },
    });

    const jobs = visits.map((visit) => {
      const metadata = record(visit.designExportMetadata);
      const optionLetter =
        typeof metadata?.approvedOptionLetter === "string"
          ? metadata.approvedOptionLetter
          : "A";
      const plan = metadata?.visitSpecsUpdated === true
        ? metadata
        : record(holidayVisitPlan(visit.designExportMetadata, optionLetter));
      const specs = holidayVisitJobSummary(
        visit.designExportMetadata,
        visit.lineItems
      );
      return {
        id: visit.id,
        title: visit.title,
        customerName: visit.customer?.name ?? visit.title,
        city: visit.property?.city ?? visit.city ?? visit.customer?.city ?? "City not listed",
        startAt: visit.startAt.toISOString(),
        dateLabel: formatInTimezone(visit.startAt, timeZone, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        timeLabel: formatInTimezone(visit.startAt, timeZone, {
          hour: "numeric",
          minute: "2-digit",
        }),
        bulbColor: specs?.colorLabel ?? "Not specified",
        strandColor: specs?.strandColor ?? "Not specified",
        linearFeet: specs?.totalFeet ?? null,
        notes: uniqueJobNotes([
          visit.workSummary,
          typeof plan?.notes === "string" ? plan.notes : null,
          ...visit.notes.map((note) => note.body),
        ]),
        completed: Boolean(visit.bulbPrepCompletedAt),
        completedAt: visit.bulbPrepCompletedAt?.toISOString() ?? null,
        completedBy: visit.bulbPrepCompletedBy?.name ?? null,
      };
    });

    return NextResponse.json({
      jobs,
      timeZone,
      windowDays: 90,
      completedCount: jobs.filter((job) => job.completed).length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("[bulb-prep/jobs] list failed", error);
    return NextResponse.json({ error: "Failed to load upcoming jobs" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canUseBulbPrepDashboard(user.role)) return forbiddenResponse();

    const body = await request.json().catch(() => ({}));
    const visitId = String(body.visitId ?? "").trim();
    if (!visitId || typeof body.completed !== "boolean") {
      return badRequestResponse("visitId and completed are required");
    }

    const visit = await prisma.visit.findFirst({
      where: {
        id: visitId,
        companyId: user.companyId,
        division: Division.HOLIDAY_LIGHTS,
        status: { notIn: [VisitStatus.CANCELLED, VisitStatus.COMPLETED] },
      },
      select: {
        id: true,
        customerId: true,
        propertyId: true,
        bulbPrepCompletedAt: true,
      },
    });
    if (!visit) {
      return NextResponse.json({ error: "Upcoming holiday job not found" }, { status: 404 });
    }

    const completedAt = body.completed ? new Date() : null;
    const updated = await prisma.visit.update({
      where: { id: visit.id },
      data: {
        bulbPrepCompletedAt: completedAt,
        bulbPrepCompletedById: body.completed ? user.id : null,
      },
      select: {
        bulbPrepCompletedAt: true,
        bulbPrepCompletedBy: { select: { name: true } },
      },
    });

    await writeStaffAuditLog({
      companyId: user.companyId,
      actorId: user.id,
      entityType: "Visit",
      entityId: visit.id,
      action: body.completed ? "BULB_PREP_COMPLETED" : "BULB_PREP_REOPENED",
      field: "bulbPrepCompletedAt",
      before: { completed: Boolean(visit.bulbPrepCompletedAt) },
      after: { completed: body.completed },
      customerId: visit.customerId,
      propertyId: visit.propertyId,
      visitId: visit.id,
    });

    return NextResponse.json({
      id: visit.id,
      completed: Boolean(updated.bulbPrepCompletedAt),
      completedAt: updated.bulbPrepCompletedAt?.toISOString() ?? null,
      completedBy: updated.bulbPrepCompletedBy?.name ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("[bulb-prep/jobs] update failed", error);
    return NextResponse.json({ error: "Failed to update bulb prep" }, { status: 500 });
  }
}
