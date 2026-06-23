import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getCustomerServiceBlock } from "@/lib/customers/service-guard";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { jobInclude, listScheduleJobs, serializeJob } from "@/lib/schedule/queries";
import type { ScheduleFilters } from "@/lib/schedule/types";
import { sendOperationalNotification } from "@/lib/notifications/send";
import { buildVisitContext } from "@/lib/notifications/templates";
import { validateAssignmentUpdate } from "@/lib/schedule/time-off";
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
    if (user.role === "TECH") return forbiddenResponse();

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

    let resolvedServiceAreaId = serviceAreaId;
    if (!resolvedServiceAreaId && zip) {
      const area = await resolveServiceAreaByZip(user.companyId, String(zip));
      resolvedServiceAreaId = area?.id;
    }
    if (!resolvedServiceAreaId) return badRequestResponse("serviceAreaId or valid zip is required");

    if (customerId) {
      const block = await getCustomerServiceBlock(user.companyId, customerId);
      if (block) return badRequestResponse(block);
    }

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

    if (visit.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: visit.customerId },
        select: { name: true, email: true, phone: true },
      });
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      });
      if (customer && company) {
        sendOperationalNotification({
          companyId: user.companyId,
          event: "VISIT_SCHEDULED",
          recipient: {
            customerId: visit.customerId,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
          },
          context: buildVisitContext({
            customerName: customer.name,
            companyName: company.name,
            visitTitle: visit.title,
            startAt: visit.startAt,
            address: [visit.address, visit.city, visit.state, visit.zip].filter(Boolean).join(", "),
          }),
        }).catch(() => {});
      }
    }

    return NextResponse.json(serializeJob(visit), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to create visit" }, { status: 500 });
  }
}
