import { NextRequest, NextResponse } from "next/server";
import { Division, VisitStatus } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveServiceAreaByZip } from "@/lib/service-areas";
import { jobInclude, listScheduleJobs, serializeJob } from "@/lib/schedule/queries";
import type { ScheduleFilters } from "@/lib/schedule/types";

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
    const { title, startAt, endAt, division, serviceAreaId, assignedUserId, crewId, customerId, propertyId, tags, address, city, state, zip } = body;

    if (!title || !startAt || !endAt || !division) {
      return badRequestResponse("title, startAt, endAt, and division are required");
    }

    let resolvedServiceAreaId = serviceAreaId;
    if (!resolvedServiceAreaId && zip) {
      const area = await resolveServiceAreaByZip(user.companyId, String(zip));
      resolvedServiceAreaId = area?.id;
    }
    if (!resolvedServiceAreaId) return badRequestResponse("serviceAreaId or valid zip is required");

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
        tags: Array.isArray(tags) ? tags : [],
        address: address ?? null,
        city: city ?? null,
        state: state ?? null,
        zip: zip ?? null,
        status: VisitStatus.SCHEDULED,
      },
      include: jobInclude,
    });

    return NextResponse.json(serializeJob(visit), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to create visit" }, { status: 500 });
  }
}
