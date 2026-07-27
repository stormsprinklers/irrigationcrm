import { NextRequest, NextResponse } from "next/server";
import { EmployeeStatus } from "@prisma/client";
import {
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Lookup a staff user on another company by email (for account linking). */
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();

    const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const found = await prisma.user.findFirst({
      where: {
        email,
        status: EmployeeStatus.ACTIVE,
        systemKind: null,
        NOT: { companyId: user.companyId },
      },
      select: {
        id: true,
        name: true,
        email: true,
        company: { select: { name: true } },
      },
    });

    if (!found) {
      return NextResponse.json(
        { error: "No active staff user with that email on another company" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: found.id,
      name: found.name,
      email: found.email,
      companyName: found.company.name,
    });
  } catch {
    return unauthorizedResponse();
  }
}
