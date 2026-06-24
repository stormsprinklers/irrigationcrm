import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { metaPageId: true, metaPageAccessToken: true },
    });

    return NextResponse.json({
      configured: Boolean(company?.metaPageId && company?.metaPageAccessToken),
    });
  } catch {
    return unauthorizedResponse();
  }
}
