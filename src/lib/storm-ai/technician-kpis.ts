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

function isAllTechniciansName(name?: string) {
  if (!name?.trim()) return true;
  const n = name.trim().toLowerCase();
  return /^(all|all techs?|all technicians|everyone|everybody|check all|all of them)$/.test(
    n
  );
}

export function wantsTechnicianLeaderboard(args: {
  technicianId?: string;
  name?: string;
}) {
  if (args.technicianId?.trim()) return false;
  return isAllTechniciansName(args.name);
}

export async function getTechnicianLeaderboard(
  companyId: string,
  rangeInput: ReportRangeInput
) {
  const { start, end, label: rangeLabel } = resolveReportRange(rangeInput);

  const technicians = await prisma.user.findMany({
    where: { companyId, status: "ACTIVE", role: "TECH" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const ids = technicians.map((t) => t.id);
  if (!ids.length) {
    return { range: rangeLabel, technicians: [] as Array<Record<string, unknown>> };
  }

  const [visits, fiveStarRows, googleAssignments] = await Promise.all([
    prisma.visit.findMany({
      where: {
        companyId,
        assignedUserId: { in: ids },
        status: VisitStatus.COMPLETED,
        updatedAt: { gte: start, lte: end },
      },
      include: { lineItems: true, discounts: true },
    }),
    prisma.feedbackSurveyResponse.findMany({
      where: {
        companyId,
        rating: 5,
        submittedAt: { gte: start, lte: end },
        visit: { assignedUserId: { in: ids } },
      },
      select: { visit: { select: { assignedUserId: true } } },
    }),
    prisma.gbpReviewAssignment.findMany({
      where: {
        userId: { in: ids },
        review: {
          companyId,
          status: GbpReviewAssignStatus.ASSIGNED,
          createTime: { gte: start, lte: end },
        },
      },
      select: { userId: true, share: true },
    }),
  ]);

  const byTech = new Map(
    technicians.map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name,
        visitCount: 0,
        totalRevenue: 0,
        callbackCount: 0,
        fiveStarReviews: 0,
        googleReviews: 0,
      },
    ])
  );

  for (const visit of visits) {
    const row = visit.assignedUserId ? byTech.get(visit.assignedUserId) : undefined;
    if (!row) continue;
    row.visitCount += 1;
    row.totalRevenue += visitRevenue(visit);
    if (visit.isCallback) row.callbackCount += 1;
  }

  for (const row of fiveStarRows) {
    const techId = row.visit?.assignedUserId;
    const tech = techId ? byTech.get(techId) : undefined;
    if (tech) tech.fiveStarReviews += 1;
  }

  for (const assignment of googleAssignments) {
    const tech = byTech.get(assignment.userId);
    if (tech) tech.googleReviews += Number(assignment.share);
  }

  const ranked = [...byTech.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      fiveStarReviews: row.fiveStarReviews,
      googleReviews: Math.round(row.googleReviews * 100) / 100,
      visitCount: row.visitCount,
      totalRevenue: Math.round(row.totalRevenue * 100) / 100,
      averageTicket:
        row.visitCount > 0 ? Math.round((row.totalRevenue / row.visitCount) * 100) / 100 : null,
      callbackCount: row.callbackCount,
      callbackRate:
        row.visitCount > 0
          ? Math.round((row.callbackCount / row.visitCount) * 1000) / 10
          : null,
    }))
    .sort(
      (a, b) =>
        b.fiveStarReviews - a.fiveStarReviews ||
        b.googleReviews - a.googleReviews ||
        b.visitCount - a.visitCount ||
        a.name.localeCompare(b.name)
    );

  return {
    range: rangeLabel,
    rankedBy: "fiveStarReviews",
    technicians: ranked,
  };
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
