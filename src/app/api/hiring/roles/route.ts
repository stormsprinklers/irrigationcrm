import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canAccessHiring } from "@/lib/hiring/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();

    const [assignments, managers, jobSlugs] = await Promise.all([
      prisma.hiringRoleAssignment.findMany({
        where: { companyId: user.companyId },
        include: {
          hiringManager: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { jobSlug: "asc" },
      }),
      prisma.user.findMany({
        where: {
          companyId: user.companyId,
          status: "ACTIVE",
          role: { in: ["ADMIN", "MANAGER"] },
        },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      }),
      prisma.jobApplicant.findMany({
        where: { companyId: user.companyId },
        distinct: ["jobSlug"],
        select: { jobSlug: true, jobTitle: true },
        orderBy: { jobSlug: "asc" },
      }),
    ]);

    return NextResponse.json({
      assignments: assignments.map((row) => ({
        id: row.id,
        jobSlug: row.jobSlug,
        jobTitle: row.jobTitle,
        hiringManagerUserId: row.hiringManagerUserId,
        hiringManager: row.hiringManager,
      })),
      managers,
      knownJobs: jobSlugs,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();
    const body = await request.json();

    const jobSlug = String(body.jobSlug ?? "").trim();
    const hiringManagerUserId = String(body.hiringManagerUserId ?? "").trim();
    const jobTitle =
      body.jobTitle != null && String(body.jobTitle).trim()
        ? String(body.jobTitle).trim()
        : null;

    if (!jobSlug || !hiringManagerUserId) {
      return badRequestResponse("jobSlug and hiringManagerUserId are required");
    }

    const manager = await prisma.user.findFirst({
      where: {
        id: hiringManagerUserId,
        companyId: user.companyId,
        status: "ACTIVE",
        role: { in: ["ADMIN", "MANAGER"] },
      },
    });
    if (!manager) return badRequestResponse("Invalid hiring manager");

    const assignment = await prisma.hiringRoleAssignment.upsert({
      where: {
        companyId_jobSlug: { companyId: user.companyId, jobSlug },
      },
      create: {
        companyId: user.companyId,
        jobSlug,
        jobTitle,
        hiringManagerUserId,
      },
      update: {
        hiringManagerUserId,
        ...(jobTitle !== null ? { jobTitle } : {}),
      },
      include: {
        hiringManager: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json({
      assignment: {
        id: assignment.id,
        jobSlug: assignment.jobSlug,
        jobTitle: assignment.jobTitle,
        hiringManagerUserId: assignment.hiringManagerUserId,
        hiringManager: assignment.hiringManager,
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();
    const jobSlug = request.nextUrl.searchParams.get("jobSlug")?.trim();
    if (!jobSlug) return badRequestResponse("jobSlug is required");

    await prisma.hiringRoleAssignment.deleteMany({
      where: { companyId: user.companyId, jobSlug },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return unauthorizedResponse();
  }
}
