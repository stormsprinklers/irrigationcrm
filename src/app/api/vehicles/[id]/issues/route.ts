import { NextRequest, NextResponse } from "next/server";
import { VehicleIssueStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { canContributeVehicles } from "@/lib/vehicles/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    const issues = await prisma.vehicleIssue.findMany({
      where: { vehicleId: id, vehicle: { companyId: user.companyId } },
      orderBy: [{ status: "asc" }, { reportedAt: "desc" }],
      include: {
        reportedBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(issues);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!vehicle) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const title = String(body.title ?? "").trim();
    if (!title) return badRequestResponse("title is required");
    const description = body.description ? String(body.description).trim() : null;

    const issue = await prisma.vehicleIssue.create({
      data: {
        vehicleId: id,
        title,
        description,
        reportedById: user.id,
      },
      include: {
        reportedBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(issue, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canContributeVehicles(user.role)) return forbiddenResponse();
    const { id } = await params;
    const body = await request.json();
    const issueId = String(body.issueId ?? "").trim();
    if (!issueId) return badRequestResponse("issueId is required");

    const existing = await prisma.vehicleIssue.findFirst({
      where: { id: issueId, vehicleId: id, vehicle: { companyId: user.companyId } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return badRequestResponse("title is required");
      data.title = title;
    }
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description).trim() : null;
    }
    if (body.status !== undefined) {
      if (!Object.values(VehicleIssueStatus).includes(body.status)) {
        return badRequestResponse("Invalid status");
      }
      data.status = body.status;
      if (body.status === VehicleIssueStatus.RESOLVED) {
        data.resolvedAt = new Date();
        data.resolvedById = user.id;
        if (body.resolutionNote !== undefined) {
          data.resolutionNote = body.resolutionNote
            ? String(body.resolutionNote).trim()
            : null;
        }
      } else if (existing.status === VehicleIssueStatus.RESOLVED) {
        data.resolvedAt = null;
        data.resolvedById = null;
      }
    } else if (body.resolutionNote !== undefined) {
      data.resolutionNote = body.resolutionNote ? String(body.resolutionNote).trim() : null;
    }

    const issue = await prisma.vehicleIssue.update({
      where: { id: issueId },
      data,
      include: {
        reportedBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(issue);
  } catch {
    return unauthorizedResponse();
  }
}
