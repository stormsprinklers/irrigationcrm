import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { winterizationTabVisible } from "@/lib/winterization/visibility";

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
        brandPalette: true,
        emailLogoUrl: true,
        phone: true,
        supportEmail: true,
        website: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        irrigationFeaturesEnabled: true,
        holidayLightingFeaturesEnabled: true,
        maintenancePlansFeaturesEnabled: true,
        winterizationTabMode: true,
        winterizationTabStartMonth: true,
        winterizationTabStartDay: true,
        winterizationTabEndMonth: true,
        winterizationTabEndDay: true,
        customerBaseUrl: true,
        timezone: true,
        emailSenderName: true,
      },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...company,
      winterizationTabVisible: winterizationTabVisible(company),
    });
  } catch {
    return unauthorizedResponse();
  }
}
