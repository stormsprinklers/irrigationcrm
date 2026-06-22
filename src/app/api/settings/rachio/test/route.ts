import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncCompanyPersonId } from "@/lib/rachio/client";
import { RachioApiError } from "@/lib/rachio/types";

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { rachioApiKey: true },
    });

    if (!company?.rachioApiKey) {
      return NextResponse.json(
        { error: "Save a Rachio API key before testing the connection" },
        { status: 400 }
      );
    }

    const result = await syncCompanyPersonId(user.companyId, company.rachioApiKey);

    return NextResponse.json({
      ok: true,
      personId: result.personId,
      fullName: result.fullName,
      email: result.email,
      deviceCount: result.devices.length,
      devices: result.devices,
    });
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
