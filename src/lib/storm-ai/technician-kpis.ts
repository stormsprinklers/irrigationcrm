import { GbpReviewAssignStatus, VisitStatus } from "@prisma/client";
import { visitRevenue } from "@/lib/compensation/commission";
import { prisma } from "@/lib/prisma";
import {
  type ReportRangeInput,
  resolveReportRange,
} from "@/lib/reporting/date-range";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export async function resolveCompanyTechnician(
  companyId: string,
  args: { technicianId?: string; name?: string }
) {
  if (args.technicianId) {
    const user = await prisma.user.findFirst({
      where: { id: args.technicianId, companyId, status: "ACTIVE" },
      select: { id: true, name: true, role: true },
    });
    return user ? { ok: true as const, user } : { ok: false as const, matches: [] };
  }

  const name = args.name?.trim();
  if (!name) return { ok: false as const, matches: [] as Array<{ id: string; name: string }> };

  const matches = await prisma.user.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      name: { contains: name, mode: "insensitive" },
    },
    select: { id: true, name: true, role: true },
    take: 8,
  });
  if (matches.length === 1) return { ok: true as const, user: matches[0] };
  return { ok: false as const, matches };
}

export async function getTechnicianKpis(
  companyId: string,
  technicianId: string,
  rangeInput: ReportRangeInput
) {
  const { start, end, label: rangeLabel } = resolveReportRange(rangeInput);

  const [visits, fiveStarReviews, googleAssignments] = await Promise.all([
    prisma.visit.findMany({
      where: {
        companyId,
        assignedUserId: technicianId,
        status: VisitStatus.COMPLETED,
        updatedAt: { gte: start, lte: end },
      },
      include: { lineItems: true, discounts: true },
    }),
    prisma.feedbackSurveyResponse.count({
      where: {
        companyId,
        rating: 5,
        submittedAt: { gte: start, lte: end },
        visit: { assignedUserId: technicianId },
      },
    }),
    prisma.gbpReviewAssignment.findMany({
      where: {
        userId: technicianId,
        review: {
          companyId,
          status: GbpReviewAssignStatus.ASSIGNED,
          createTime: { gte: start, lte: end },
        },
      },
      select: { share: true },
    }),
  ]);

  const revenues = visits.map((visit) => visitRevenue(visit));
  const totalRevenue = revenues.reduce((sum, value) => sum + value, 0);
  const visitCount = visits.length;
  const callbackCount = visits.filter((visit) => visit.isCallback).length;
  const googleReviews = googleAssignments.reduce((sum, row) => sum + Number(row.share), 0);

  return {
    range: rangeLabel,
    visitCount,
    totalRevenue,
    averageTicket: visitCount > 0 ? totalRevenue / visitCount : null,
    callbackCount,
    callbackRate: visitCount > 0 ? (callbackCount / visitCount) * 100 : null,
    fiveStarReviews,
    googleReviews,
    metrics: [
      { label: "Jobs completed", value: String(visitCount) },
      { label: "Total revenue", value: formatCurrency(totalRevenue) },
      {
        label: "Average ticket",
        value: visitCount > 0 ? formatCurrency(totalRevenue / visitCount) : "—",
      },
      {
        label: "Callback rate",
        value: visitCount > 0 ? formatPercent((callbackCount / visitCount) * 100) : "—",
      },
      { label: "Callbacks", value: String(callbackCount) },
      { label: "5-star reviews", value: String(fiveStarReviews) },
      { label: "Google reviews", value: googleReviews.toFixed(2) },
    ],
  };
}
