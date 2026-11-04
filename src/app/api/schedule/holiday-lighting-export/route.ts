import { VisitStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenForFieldRole, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { formatInTimezone } from "@/lib/datetime/zoned";
import { holidayVisitJobSummary } from "@/lib/holiday-lighting/visit-plan";
import { buildHolidayScheduleCsv } from "@/lib/holiday-lighting/schedule-export";
import { prisma } from "@/lib/prisma";

function joinAddress(...parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role);
    if (fieldDenied) return fieldDenied;

    const start = new Date(request.nextUrl.searchParams.get("start") ?? "");
    const end = new Date(request.nextUrl.searchParams.get("end") ?? "");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return badRequestResponse("Choose a valid export date range");
    }
    if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
      return badRequestResponse("Export ranges cannot exceed one year");
    }

    const [company, visits] = await Promise.all([
      prisma.company.findUnique({ where: { id: user.companyId }, select: { timezone: true } }),
      prisma.visit.findMany({
        where: {
          companyId: user.companyId,
          status: { notIn: [VisitStatus.CANCELLED, VisitStatus.UNSCHEDULED] },
          startAt: { gte: start, lt: end },
        },
        orderBy: { startAt: "asc" },
        select: {
          startAt: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          designExportMetadata: true,
          customer: { select: { name: true, address: true, city: true, state: true, zip: true } },
          property: { select: { address: true, city: true, state: true, zip: true } },
          assignedUser: { select: { id: true, name: true } },
          additionalAssignees: { select: { user: { select: { id: true, name: true } } } },
          crew: {
            select: {
              name: true,
              members: { select: { user: { select: { id: true, name: true } } } },
            },
          },
          lineItems: { select: { name: true, description: true } },
        },
      }),
    ]);
    const timeZone = company?.timezone ?? "America/Denver";
    const rows = visits.flatMap((visit) => {
      const summary = holidayVisitJobSummary(visit.designExportMetadata, visit.lineItems);
      if (!summary) return [];
      const people = visit.crew
        ? visit.crew.members.map((member) => member.user)
        : [
            ...(visit.assignedUser ? [visit.assignedUser] : []),
            ...visit.additionalAssignees.map((entry) => entry.user),
          ];
      const technicians = [...new Map(people.map((person) => [person.id, person.name])).values()];
      const address = visit.property?.address || visit.address
        ? joinAddress(
            visit.property?.address ?? visit.address,
            visit.property?.city ?? visit.city,
            visit.property?.state ?? visit.state,
            visit.property?.zip ?? visit.zip
          )
        : joinAddress(
            visit.customer?.address,
            visit.customer?.city,
            visit.customer?.state,
            visit.customer?.zip
          );
      return [{
        date: formatInTimezone(visit.startAt, timeZone, {
          year: "numeric", month: "2-digit", day: "2-digit",
        }),
        time: formatInTimezone(visit.startAt, timeZone, {
          hour: "numeric", minute: "2-digit",
        }),
        customerName: visit.customer?.name ?? "",
        technicians: technicians.join("; ") || visit.crew?.name || "Unassigned",
        address,
        strandColor: summary.strandColor ?? "",
        footageCount: summary.totalFeet,
        lightColorPattern: summary.colorLabel === "Not specified" ? "" : summary.colorLabel,
      }];
    });

    const fileDate = new Date().toISOString().slice(0, 10);
    return new NextResponse(buildHolidayScheduleCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="holiday-lighting-schedule-${fileDate}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}
