import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { forbiddenForFieldRole, badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCustomerServiceBlock } from "@/lib/customers/service-guard";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { jobInclude, listScheduleJobs, serializeJob } from "@/lib/schedule/queries";
import type { ScheduleFilters } from "@/lib/schedule/types";
import { onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { validateAssignmentUpdate } from "@/lib/schedule/time-off";
import { validateScheduledVisitAssignment } from "@/lib/schedule/visit-assignment";
import { syncVisitChecklists } from "@/lib/checklists/apply";
import { syncCallbackTag } from "@/lib/checklists/callback";

function parseFilters(searchParams: URLSearchParams): ScheduleFilters {
  return {
    serviceAreaIds: searchParams.getAll("serviceAreaIds").filter(Boolean),
    userIds: searchParams.getAll("userIds").filter(Boolean),
    crewIds: searchParams.getAll("crewIds").filter(Boolean),
    divisions: searchParams.getAll("divisions").filter(Boolean) as ("INSTALL" | "SERVICE")[],
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = request.nextUrl;
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    if (!startParam || !endParam) return badRequestResponse("start and end query params are required");

    const start = new Date(startParam);
    const end = new Date(endParam);
    const jobs = await listScheduleJobs(user.companyId, start, end, parseFilters(searchParams));
    return NextResponse.json(jobs);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const body = await request.json();
    const {
      title,
      startAt,
      endAt,
      division,
      serviceAreaId,
      assignedUserId,
      crewId,
      customerId,
      propertyId,
      tags,
      address,
      city,
      state,
      zip,
      callSessionId,
    } = body;

    if (!title || !startAt || !endAt || !division) {
      return badRequestResponse("title, startAt, endAt, and division are required");
    }

    let zipForArea = zip ? String(zip) : null;
    if (propertyId) {
      const property = await prisma.customerProperty.findFirst({
        where: { id: String(propertyId), companyId: user.companyId },
        select: { zip: true },
      });
      if (property?.zip) zipForArea = property.zip;
    }

    // Service area is derived from the job/property zip when possible.
    let resolvedServiceAreaId: string | null = null;
    if (zipForArea) {
      const area = await resolveServiceAreaByZip(user.companyId, zipForArea);
      resolvedServiceAreaId = area?.id ?? null;
    }
    if (!resolvedServiceAreaId && serviceAreaId) {
      resolvedServiceAreaId = String(serviceAreaId);
    }
    if (!resolvedServiceAreaId && !zipForArea) {
      return badRequestResponse("A property zip or service area is required");
    }

    if (customerId) {
      const block = await getCustomerServiceBlock(user.companyId, customerId);
      if (block) return badRequestResponse(block);
    }

    const assignmentError = validateScheduledVisitAssignment(VisitStatus.SCHEDULED, assignedUserId);
    if (assignmentError) return badRequestResponse(assignmentError);

    const jobStart = new Date(startAt);
    const jobEnd = new Date(endAt);
    if (assignedUserId) {
      const availabilityError = await validateAssignmentUpdate(
        user.companyId,
        assignedUserId,
        jobStart,
        jobEnd
      );
      if (availabilityError) return badRequestResponse(availabilityError);
    }

    const isCallback = Boolean(body.isCallback);
    const rawTags = Array.isArray(tags) ? tags : [];
    const visitTags = syncCallbackTag(rawTags, isCallback);

    const visit = await prisma.visit.create({
      data: {
        companyId: user.companyId,
        title: String(title),
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        division: division as Division,
        serviceAreaId: resolvedServiceAreaId,
        assignedUserId: assignedUserId ?? null,
        crewId: crewId ?? null,
        customerId: customerId ?? null,
        propertyId: propertyId ?? null,
        tags: visitTags,
        isCallback,
        address: address ?? null,
        city: city ?? null,
        state: state ?? null,
        zip: zip ?? null,
        status: VisitStatus.SCHEDULED,
        callSessionId: callSessionId ?? null,
      },
      include: jobInclude,
    });

    await syncVisitChecklists(visit.id, user.companyId);

    if (callSessionId) {
      const { linkVisitToCallSession } = await import("@/lib/voice/call-conversion");
      void linkVisitToCallSession({
        companyId: user.companyId,
        callSessionId: String(callSessionId),
        visitId: visit.id,
        answeredByUserId: user.id,
        markBooked: true,
      }).catch(() => {});
    } else if (visit.customerId) {
      // Any appointment booked ~around a call with same customer → count as booked.
      const { linkVisitToNearbyCalls } = await import("@/lib/voice/call-conversion");
      const customer = await prisma.customer.findFirst({
        where: { id: visit.customerId, companyId: user.companyId },
        select: { phone: true },
      });
      void linkVisitToNearbyCalls({
        companyId: user.companyId,
        visitId: visit.id,
        customerId: visit.customerId,
        phone: customer?.phone,
        aroundDate: new Date(),
        windowMinutes: 15,
        answeredByUserId: user.id,
      }).catch(() => {});
    }

    if (visit.customerId) {
      void onVisitTimeChanged({
        visitId: visit.id,
        companyId: user.companyId,
        isInitialSchedule: true,
      }).catch(() => {});

      const { onReferralVisitBooked } = await import("@/lib/referrals/conversion");
      void onReferralVisitBooked({
        companyId: user.companyId,
        customerId: visit.customerId,
        visitId: visit.id,
      }).catch(() => {});
    }

    return NextResponse.json(serializeJob(visit), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to create visit" }, { status: 500 });
  }
}
