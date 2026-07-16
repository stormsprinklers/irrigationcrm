import { NextResponse } from "next/server";
import { EmployeeStatus } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { fetchLmsTrainingSummary } from "@/lib/integrations/lms-sync";
import { prisma } from "@/lib/prisma";

export type CertBadge = {
  title: string;
  badgeUrl: string | null;
};

export async function GET() {
  try {
    const user = await requireSessionUser();
    const employees = await prisma.user.findMany({
      where: { companyId: user.companyId, status: EmployeeStatus.ACTIVE },
      select: { id: true },
    });

    const badgesByUserId: Record<string, CertBadge[]> = {};

    await Promise.all(
      employees.map(async (employee) => {
        const summary = await fetchLmsTrainingSummary(employee.id);
        if (!summary || typeof summary !== "object" || "error" in summary) {
          badgesByUserId[employee.id] = [];
          return;
        }
        const certs = Array.isArray(summary.certifications) ? summary.certifications : [];
        badgesByUserId[employee.id] = certs
          .filter(
            (c: { badgeUrl?: string | null }) =>
              typeof c?.badgeUrl === "string" && c.badgeUrl.length > 0
          )
          .map((c: { title?: string; badgeUrl?: string | null }) => ({
            title: c.title ?? "Certificate",
            badgeUrl: c.badgeUrl ?? null,
          }));
      })
    );

    return NextResponse.json(badgesByUserId);
  } catch {
    return unauthorizedResponse();
  }
}
