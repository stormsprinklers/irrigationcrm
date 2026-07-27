import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/** Lightweight branding payload for staff CRM chrome (logo + colors). */
export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        id: true,
        name: true,
        brandLogoUrl: true,
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        emailLogoUrl: true,
      },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    return NextResponse.json(company);
  } catch {
    return unauthorizedResponse();
  }
}
