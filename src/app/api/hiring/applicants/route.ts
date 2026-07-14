import { NextRequest, NextResponse } from "next/server";
import { ApplicantStage } from "@prisma/client";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { serializeApplicant } from "@/lib/hiring/applicants";
import { canAccessHiring } from "@/lib/hiring/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();

    const jobSlug = request.nextUrl.searchParams.get("jobSlug");
    const stageParam = request.nextUrl.searchParams.get("stage");
    const stage =
      stageParam && Object.values(ApplicantStage).includes(stageParam as ApplicantStage)
        ? (stageParam as ApplicantStage)
        : undefined;

    const applicants = await prisma.jobApplicant.findMany({
      where: {
        companyId: user.companyId,
        ...(jobSlug ? { jobSlug } : {}),
        ...(stage ? { stage } : {}),
      },
      include: {
        bookings: {
          where: { status: "SCHEDULED" },
          orderBy: { startAt: "asc" },
          take: 1,
          include: { manager: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    });

    applicants.sort((a, b) => {
      const scoreA = a.aiScore ?? -1;
      const scoreB = b.aiScore ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const positions = await prisma.jobApplicant.groupBy({
      by: ["jobSlug", "jobTitle"],
      where: { companyId: user.companyId },
      _count: { _all: true },
    });

    return NextResponse.json({
      applicants: applicants.map(serializeApplicant),
      positions: positions
        .map((row) => ({
          jobSlug: row.jobSlug,
          jobTitle: row.jobTitle,
          count: row._count._all,
        }))
        .sort((a, b) => a.jobSlug.localeCompare(b.jobSlug)),
    });
  } catch {
    return unauthorizedResponse();
  }
}
