import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { companySettingsSelect } from "@/lib/company/types";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: companySettingsSelect,
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const body = await request.json();
    const allowed = { ...companySettingsSelect };
    delete (allowed as { id?: boolean }).id;

    const data: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (key === "id") continue;
      if (key in allowed) {
        data[key] = body[key];
      }
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data,
      select: companySettingsSelect,
    });

    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}
