import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import {
  generateReviewNameAliases,
  REVIEW_ALIAS_ROLES,
} from "@/lib/google-business/review-aliases";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const employee = await prisma.user.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, firstName: true, role: true },
    });
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!REVIEW_ALIAS_ROLES.includes(employee.role)) {
      return badRequestResponse("Review aliases are only used for technicians and installers");
    }

    const aliases = await generateReviewNameAliases({
      companyId: user.companyId,
      userId: employee.id,
      firstName: employee.firstName,
    });
    await prisma.user.update({
      where: { id: employee.id },
      data: { reviewNameAliases: aliases },
    });

    return NextResponse.json({ reviewNameAliases: aliases });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to generate aliases" }, { status: 500 });
  }
}
