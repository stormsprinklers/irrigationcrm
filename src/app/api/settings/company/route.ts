import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { sanitizeBrandPalette, type BrandPalette } from "@/lib/brand-palette";
import {
  ACTIVE_MAINTENANCE_ENROLLMENT_STATUSES,
} from "@/lib/company/features";
import { companySettingsSelect } from "@/lib/company/types";
import { countActiveMaintenanceEnrollments } from "@/lib/maintenance-plans/feature";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: companySettingsSelect,
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const activeMaintenanceEnrollmentCount = await countActiveMaintenanceEnrollments(
      user.companyId
    );
    return NextResponse.json({ ...company, activeMaintenanceEnrollmentCount });
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
      // From address is managed under Settings → Inbox, not company profile save.
      if (key === "sendgridFrom") continue;
      if (key in allowed) {
        data[key] = body[key];
      }
    }

    if ("brandPalette" in data || "brandPrimaryColor" in data || "brandSecondaryColor" in data) {
      const fromBody =
        data.brandPalette && typeof data.brandPalette === "object"
          ? (data.brandPalette as Partial<BrandPalette>)
          : {};
      const palette = sanitizeBrandPalette({
        ...fromBody,
        primary: (data.brandPrimaryColor as string | null | undefined) ?? fromBody.primary,
        secondary: (data.brandSecondaryColor as string | null | undefined) ?? fromBody.secondary,
      });
      data.brandPalette = palette;
      data.brandPrimaryColor = palette.primary;
      data.brandSecondaryColor = palette.secondary;
    }

    if (data.maintenancePlansFeaturesEnabled === false) {
      const activeCount = await countActiveMaintenanceEnrollments(user.companyId);
      if (activeCount > 0) {
        return NextResponse.json(
          {
            error: `Cannot disable maintenance plans while ${activeCount} customer${
              activeCount === 1 ? " is" : "s are"
            } actively enrolled (${ACTIVE_MAINTENANCE_ENROLLMENT_STATUSES.join(", ")}).`,
            activeMaintenanceEnrollmentCount: activeCount,
          },
          { status: 400 }
        );
      }
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data,
      select: companySettingsSelect,
    });

    const activeMaintenanceEnrollmentCount = await countActiveMaintenanceEnrollments(
      user.companyId
    );

    return NextResponse.json({ ...company, activeMaintenanceEnrollmentCount });
  } catch {
    return unauthorizedResponse();
  }
}
