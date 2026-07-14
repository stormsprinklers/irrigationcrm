import { NextRequest, NextResponse } from "next/server";
import { ApplicantStage } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { serializeApplicant, updateApplicantStage } from "@/lib/hiring/applicants";
import { canAccessHiring } from "@/lib/hiring/permissions";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();
    const { id } = await params;

    const applicant = await prisma.jobApplicant.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        bookings: {
          where: { status: { not: "CANCELLED" } },
          orderBy: { startAt: "asc" },
          include: { manager: { select: { id: true, name: true } } },
        },
      },
    });
    if (!applicant) return notFoundResponse();

    return NextResponse.json(serializeApplicant(applicant));
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canAccessHiring(user.role)) return forbiddenResponse();
    const { id } = await params;
    const body = await request.json();

    if (
      body.stage === undefined ||
      !Object.values(ApplicantStage).includes(body.stage as ApplicantStage)
    ) {
      return badRequestResponse("Invalid stage");
    }

    const updated = await updateApplicantStage(
      user.companyId,
      id,
      body.stage as ApplicantStage
    );
    if (!updated) return notFoundResponse();
    return NextResponse.json(serializeApplicant(updated));
  } catch {
    return unauthorizedResponse();
  }
}
