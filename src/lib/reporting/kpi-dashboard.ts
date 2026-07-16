import {
  CallDisposition,
  CallDirection,
  Division,
  EnrollmentStatus,
  EstimateStatus,
  LeadStatus,
  VisitStatus,
} from "@prisma/client";
import { computeVisitWorkHours, visitRevenue } from "@/lib/compensation/commission";
import {
  type ReportPresetRange,
  type ReportRangeInput,
  resolveReportRange,
} from "@/lib/reporting/date-range";
import { prisma } from "@/lib/prisma";
import { fetchLmsTrainingSummary } from "@/lib/integrations/lms-sync";

export type KpiDateRange = ReportPresetRange | "custom";

export type KpiMetric = { label: string; value: string };

export type KpiPersonCard = {
  id: string;
  name: string;
  photoUrl: string | null;
  color: string | null;
  metrics: KpiMetric[];
  certBadges?: Array<{ title: string; badgeUrl: string | null }>;
};

export type KpiCrewCard = {
  id: string;
  name: string;
  color: string;
  metrics: KpiMetric[];
};

export type KpiDashboardReport = {
  range: KpiDateRange;
  rangeLabel: string;
  company: KpiMetric[];
  technicians: KpiPersonCard[];
  csrs: KpiPersonCard[];
  crews: KpiCrewCard[];
  salespeople: KpiPersonCard[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format average first-contact time (can span hours). */
function formatSpeedToLead(seconds: number) {
  if (seconds <= 0) return "0:00";
  const totalSec = Math.round(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function estimateConversionRate(
  estimates: Array<{ status: EstimateStatus }>
) {
  const sent = estimates.filter((e) => e.status === EstimateStatus.SENT).length;
  const approved = estimates.filter(
    (e) => e.status === EstimateStatus.APPROVED || e.status === EstimateStatus.CONVERTED
  ).length;
  const declined = estimates.filter((e) => e.status === EstimateStatus.DECLINED).length;
  const decided = sent + approved + declined;
  if (decided === 0) return 0;
  return (approved / decided) * 100;
}

function isSalesperson(user: {
  role: string;
  title: string | null;
  tags: string[];
  division: Division | null;
}) {
  if (user.role === "SALES") return true;
  if (user.tags.some((t) => t.toLowerCase() === "sales")) return true;
  if (user.title?.toLowerCase().includes("sales")) return true;
  return false;
}

export async function getKpiDashboardReport(
  companyId: string,
  rangeInput: ReportRangeInput = { preset: "ytd" }
): Promise<KpiDashboardReport> {
  const { start, end, label: rangeLabel, preset: range } = resolveReportRange(rangeInput);

  const [
    users,
    crews,
    visits,
    estimates,
    feedback,
    callLogs,
    enrollments,
    leads,
    activePlanCount,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        color: true,
        role: true,
        title: true,
        tags: true,
        division: true,
        crewMemberships: { select: { crewId: true } },
      },
    }),
    prisma.crew.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        color: true,
        division: true,
        members: { select: { userId: true } },
      },
    }),
    prisma.visit.findMany({
      where: {
        companyId,
        status: VisitStatus.COMPLETED,
        updatedAt: { gte: start, lte: end },
      },
      include: {
        lineItems: true,
        discounts: true,
        timeEvents: { select: { type: true, occurredAt: true, userId: true } },
        feedbackSurveyResponses: { select: { rating: true, submittedAt: true } },
        estimates: { select: { status: true, total: true } },
      },
    }),
    prisma.estimate.findMany({
      where: {
        companyId,
        updatedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        status: true,
        total: true,
        customerId: true,
        visit: { select: { division: true, assignedUserId: true, crewId: true } },
      },
    }),
    prisma.feedbackSurveyResponse.findMany({
      where: {
        companyId,
        submittedAt: { gte: start, lte: end },
      },
      select: {
        rating: true,
        visit: { select: { assignedUserId: true, crewId: true } },
      },
    }),
    prisma.callLog.findMany({
      where: {
        companyId,
        startedAt: { gte: start, lte: end },
        handledByUserId: { not: null },
      },
      select: {
        direction: true,
        durationSec: true,
        disposition: true,
        handledByUserId: true,
        customerId: true,
        startedAt: true,
        visit: {
          include: { lineItems: true, discounts: true },
        },
      },
    }),
    prisma.maintenancePlanEnrollment.findMany({
      where: {
        companyId,
        acceptedAt: { gte: start, lte: end },
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.RENEWED] },
      },
      select: {
        customerId: true,
        acceptedAt: true,
        template: { select: { basePrice: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        companyId,
        assignedUserId: { not: null },
      },
      select: {
        assignedUserId: true,
        status: true,
        convertedCustomerId: true,
        updatedAt: true,
        createdAt: true,
        contactedAt: true,
      },
    }),
    prisma.maintenancePlanEnrollment.count({
      where: {
        companyId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.RENEWED] },
      },
    }),
  ]);

  const visitRevenues = visits.map((v) => ({
    visit: v,
    revenue: visitRevenue(v),
  }));

  const totalRevenue = visitRevenues.reduce((sum, v) => sum + v.revenue, 0);

  const installVisits = visitRevenues.filter((v) => v.visit.division === Division.INSTALL);
  const serviceVisits = visitRevenues.filter((v) => v.visit.division === Division.SERVICE);

  const installRevenue = installVisits.reduce((s, v) => s + v.revenue, 0);
  const serviceRevenue = serviceVisits.reduce((s, v) => s + v.revenue, 0);

  const avgInstallTicket = installVisits.length > 0 ? installRevenue / installVisits.length : 0;
  const avgServiceTicket = serviceVisits.length > 0 ? serviceRevenue / serviceVisits.length : 0;

  let companyBookedCalls = 0;
  let companyDispositionedCalls = 0;
  for (const call of callLogs) {
    if (
      call.direction === CallDirection.INBOUND &&
      call.disposition !== CallDisposition.NONE
    ) {
      companyDispositionedCalls += 1;
      if (call.disposition === CallDisposition.BOOKED) companyBookedCalls += 1;
    }
  }
  const companyBookingRate =
    companyDispositionedCalls > 0
      ? (companyBookedCalls / companyDispositionedCalls) * 100
      : 0;

  const serviceEstimates = estimates.filter((e) => e.visit?.division === Division.SERVICE);
  const serviceConversionRate = estimateConversionRate(serviceEstimates);

  const {
    getAveragePayingCustomerLtv,
    sumMarketingSpend,
  } = await import("@/lib/marketing/attribution-kpis");

  const [{ avgLtv, payingCustomerCount }, periodSpend, allTimeSpend, newCustomersInRange] =
    await Promise.all([
      getAveragePayingCustomerLtv(companyId),
      sumMarketingSpend(companyId, {
        start,
        end,
      }),
      sumMarketingSpend(companyId),
      prisma.customer.count({
        where: { companyId, createdAt: { gte: start, lte: end } },
      }),
    ]);

  const periodCac =
    newCustomersInRange > 0 && periodSpend > 0 ? periodSpend / newCustomersInRange : null;
  const allTimeCac =
    payingCustomerCount > 0 && allTimeSpend > 0 ? allTimeSpend / payingCustomerCount : null;
  const ltvCacPeriod =
    periodCac && avgLtv > 0 ? avgLtv / periodCac : null;
  const ltvCacAllTime =
    allTimeCac && avgLtv > 0 ? avgLtv / allTimeCac : null;

  function formatRatio(value: number | null) {
    if (value == null || !Number.isFinite(value)) return "—";
    return `${value.toFixed(2)}x`;
  }

  const company: KpiMetric[] = [
    { label: "Service revenue", value: formatCurrency(serviceRevenue) },
    { label: "Install revenue", value: formatCurrency(installRevenue) },
    { label: "Total revenue", value: formatCurrency(totalRevenue) },
    {
      label: "Service avg ticket",
      value: serviceVisits.length > 0 ? formatCurrency(avgServiceTicket) : "—",
    },
    {
      label: "Install avg ticket",
      value: installVisits.length > 0 ? formatCurrency(avgInstallTicket) : "—",
    },
    {
      label: "Booking rate",
      value: companyDispositionedCalls > 0 ? formatPercent(companyBookingRate) : "—",
    },
    {
      label: "Service conversion rate",
      value: serviceEstimates.length > 0 ? formatPercent(serviceConversionRate) : "—",
    },
    { label: "Active maintenance plans", value: String(activePlanCount) },
    {
      label: "Avg LTV:CAC (period)",
      value: formatRatio(ltvCacPeriod),
    },
    {
      label: "Avg LTV:CAC (all-time)",
      value: formatRatio(ltvCacAllTime),
    },
  ];

  function buildSoloFieldWorkerCards(
    role: "TECH" | "INSTALLER",
    estimateDivision: Division,
    options: { includeCallbackRate?: boolean } = {}
  ): KpiPersonCard[] {
    const workers = users.filter(
      (u) => u.role === role && u.crewMemberships.length === 0
    );

    const cards = workers.map((worker) => {
      const workerVisits = visitRevenues.filter(
        (v) => v.visit.assignedUserId === worker.id && v.visit.crewId == null
      );
      const revenue = workerVisits.reduce((s, v) => s + v.revenue, 0);
      const visitCount = workerVisits.length;
      const callbackCount = workerVisits.filter((v) => v.visit.isCallback).length;
      const callbackRate = visitCount > 0 ? (callbackCount / visitCount) * 100 : 0;

      let totalHours = 0;
      for (const { visit } of workerVisits) {
        const hoursByUser = computeVisitWorkHours(visit.timeEvents);
        totalHours += hoursByUser.get(worker.id) ?? 0;
      }

      const workerEstimates = estimates.filter(
        (e) =>
          e.visit?.assignedUserId === worker.id &&
          e.visit.crewId == null &&
          e.visit.division === estimateDivision
      );
      const conversionRate = estimateConversionRate(workerEstimates);

      const fiveStarReviews = feedback.filter(
        (f) =>
          f.rating === 5 &&
          f.visit.assignedUserId === worker.id &&
          f.visit.crewId == null
      ).length;

      return {
        id: worker.id,
        name: worker.name,
        photoUrl: worker.photoUrl,
        color: worker.color,
        metrics: [
          { label: "Total revenue", value: formatCurrency(revenue) },
          {
            label: "Revenue / hour",
            value: totalHours > 0 ? formatCurrency(revenue / totalHours) : "—",
          },
          {
            label: "Average ticket",
            value: visitCount > 0 ? formatCurrency(revenue / visitCount) : "—",
          },
          {
            label: "Conversion rate",
            value: workerEstimates.length > 0 ? formatPercent(conversionRate) : "—",
          },
          { label: "5-star reviews", value: String(fiveStarReviews) },
          ...(options.includeCallbackRate
            ? [
                {
                  label: "Callback rate",
                  value: visitCount > 0 ? formatPercent(callbackRate) : "—",
                },
              ]
            : []),
        ],
      };
    });

    cards.sort(
      (a, b) =>
        parseFloat(b.metrics[0].value.replace(/[^0-9.-]/g, "") || "0") -
        parseFloat(a.metrics[0].value.replace(/[^0-9.-]/g, "") || "0")
    );

    return cards;
  }

  const technicians = buildSoloFieldWorkerCards("TECH", Division.SERVICE, {
    includeCallbackRate: true,
  });

  const csrUsers = users.filter((u) => u.role === "CSR");

  const bookingCallsByCsr = new Map<
    string,
    { booked: number; dispositioned: number; totalDuration: number; callCount: number; bookedRevenue: number[] }
  >();

  for (const call of callLogs) {
    const csrId = call.handledByUserId!;
    const entry = bookingCallsByCsr.get(csrId) ?? {
      booked: 0,
      dispositioned: 0,
      totalDuration: 0,
      callCount: 0,
      bookedRevenue: [],
    };

    if (call.direction === CallDirection.INBOUND) {
      if (call.disposition !== CallDisposition.NONE) {
        entry.dispositioned++;
        if (call.disposition === CallDisposition.BOOKED) {
          entry.booked++;
          if (call.visit) {
            entry.bookedRevenue.push(visitRevenue(call.visit));
          }
        }
      }
    }

    entry.callCount++;
    entry.totalDuration += call.durationSec ?? 0;

    bookingCallsByCsr.set(csrId, entry);
  }

  const plansSoldByCsr = new Map<string, number>();
  for (const enrollment of enrollments) {
    if (!enrollment.acceptedAt || !enrollment.customerId) continue;
    const bookingCall = callLogs
      .filter(
        (c) =>
          c.customerId === enrollment.customerId &&
          c.disposition === CallDisposition.BOOKED &&
          c.handledByUserId &&
          c.startedAt <= enrollment.acceptedAt!
      )
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    if (bookingCall?.handledByUserId) {
      plansSoldByCsr.set(
        bookingCall.handledByUserId,
        (plansSoldByCsr.get(bookingCall.handledByUserId) ?? 0) + 1
      );
    }
  }

  const csrs: KpiPersonCard[] = csrUsers.map((csr) => {
    const stats = bookingCallsByCsr.get(csr.id) ?? {
      booked: 0,
      dispositioned: 0,
      totalDuration: 0,
      callCount: 0,
      bookedRevenue: [],
    };
    const bookRate =
      stats.dispositioned > 0 ? (stats.booked / stats.dispositioned) * 100 : 0;
    const avgDuration =
      stats.callCount > 0 ? Math.round(stats.totalDuration / stats.callCount) : 0;
    const avgBookedRevenue =
      stats.bookedRevenue.length > 0
        ? stats.bookedRevenue.reduce((s, v) => s + v, 0) / stats.bookedRevenue.length
        : 0;

    const speedSamples = leads.filter(
      (lead) =>
        lead.assignedUserId === csr.id &&
        lead.contactedAt != null &&
        lead.status !== LeadStatus.SPAM &&
        lead.contactedAt >= start &&
        lead.contactedAt <= end
    );
    const speedSeconds = speedSamples
      .map((lead) => (lead.contactedAt!.getTime() - lead.createdAt.getTime()) / 1000)
      .filter((sec) => Number.isFinite(sec) && sec >= 0);
    const avgSpeedToLead =
      speedSeconds.length > 0
        ? speedSeconds.reduce((sum, sec) => sum + sec, 0) / speedSeconds.length
        : null;

    return {
      id: csr.id,
      name: csr.name,
      photoUrl: csr.photoUrl,
      color: csr.color,
      metrics: [
        {
          label: "Booking rate",
          value: stats.dispositioned > 0 ? formatPercent(bookRate) : "—",
        },
        {
          label: "Avg speed to lead",
          value: avgSpeedToLead != null ? formatSpeedToLead(avgSpeedToLead) : "—",
        },
        {
          label: "Avg call duration",
          value: stats.callCount > 0 ? formatDuration(avgDuration) : "—",
        },
        {
          label: "Avg booked appt revenue",
          value:
            stats.bookedRevenue.length > 0 ? formatCurrency(avgBookedRevenue) : "—",
        },
        {
          label: "Maintenance plans sold",
          value: String(plansSoldByCsr.get(csr.id) ?? 0),
        },
      ],
    };
  });

  csrs.sort(
    (a, b) =>
      parseFloat(b.metrics[0].value.replace(/[^0-9.-]/g, "") || "0") -
      parseFloat(a.metrics[0].value.replace(/[^0-9.-]/g, "") || "0")
  );

  const crewCards: KpiCrewCard[] = crews.map((crew) => {
    const crewVisits = visitRevenues.filter((v) => v.visit.crewId === crew.id);
    const revenue = crewVisits.reduce((s, v) => s + v.revenue, 0);
    const visitCount = crewVisits.length;
    const callbackCount = crewVisits.filter((v) => v.visit.isCallback).length;
    const callbackRate = visitCount > 0 ? (callbackCount / visitCount) * 100 : 0;
    const memberIds = new Set(crew.members.map((m) => m.userId));

    let totalManHours = 0;
    for (const { visit } of crewVisits) {
      const hoursByUser = computeVisitWorkHours(visit.timeEvents);
      for (const [userId, hours] of hoursByUser) {
        if (memberIds.has(userId)) totalManHours += hours;
      }
    }

    const fiveStarReviews = feedback.filter(
      (f) => f.rating === 5 && f.visit.crewId === crew.id
    ).length;

    return {
      id: crew.id,
      name: crew.name,
      color: crew.color,
      metrics: [
        { label: "Total revenue", value: formatCurrency(revenue) },
        {
          label: "Avg per man hour",
          value: totalManHours > 0 ? formatCurrency(revenue / totalManHours) : "—",
        },
        { label: "5-star reviews", value: String(fiveStarReviews) },
        ...(crew.division === Division.INSTALL
          ? [
              {
                label: "Callback rate",
                value: visitCount > 0 ? formatPercent(callbackRate) : "—",
              },
            ]
          : []),
      ],
    };
  });

  crewCards.sort(
    (a, b) =>
      parseFloat(b.metrics[0].value.replace(/[^0-9.-]/g, "")) -
      parseFloat(a.metrics[0].value.replace(/[^0-9.-]/g, ""))
  );

  const salesUsers = users.filter(isSalesperson);

  const salesEstimatesByCustomer = new Map<string, typeof estimates>();
  for (const est of estimates) {
    if (
      est.status !== EstimateStatus.APPROVED &&
      est.status !== EstimateStatus.CONVERTED
    ) {
      continue;
    }
    const list = salesEstimatesByCustomer.get(est.customerId) ?? [];
    list.push(est);
    salesEstimatesByCustomer.set(est.customerId, list);
  }

  const salespeople: KpiPersonCard[] = salesUsers.map((person) => {
    const assignedLeads = leads.filter((l) => l.assignedUserId === person.id);
    const wonLeads = assignedLeads.filter((l) => l.status === LeadStatus.WON);
    const lostLeads = assignedLeads.filter((l) => l.status === LeadStatus.LOST);
    const decidedLeads = wonLeads.length + lostLeads.length;
    const conversionRate = decidedLeads > 0 ? (wonLeads.length / decidedLeads) * 100 : 0;

    const wonCustomerIds = new Set(
      wonLeads.map((l) => l.convertedCustomerId).filter(Boolean) as string[]
    );

    let revenue = 0;
    let soldCount = 0;
    for (const customerId of wonCustomerIds) {
      const customerEstimates = salesEstimatesByCustomer.get(customerId) ?? [];
      for (const est of customerEstimates) {
        revenue += Number(est.total);
        soldCount++;
      }
    }

    return {
      id: person.id,
      name: person.name,
      photoUrl: person.photoUrl,
      color: person.color,
      metrics: [
        {
          label: "Conversion rate",
          value: decidedLeads > 0 ? formatPercent(conversionRate) : "—",
        },
        {
          label: "Average ticket",
          value: soldCount > 0 ? formatCurrency(revenue / soldCount) : "—",
        },
        { label: "Total revenue sold", value: formatCurrency(revenue) },
      ],
    };
  });

  salespeople.sort(
    (a, b) =>
      parseFloat(b.metrics[2].value.replace(/[^0-9.-]/g, "")) -
      parseFloat(a.metrics[2].value.replace(/[^0-9.-]/g, ""))
  );

  async function withCertBadges(cards: KpiPersonCard[]): Promise<KpiPersonCard[]> {
    return Promise.all(
      cards.map(async (card) => {
        try {
          const summary = await fetchLmsTrainingSummary(card.id);
          if (!summary || typeof summary !== "object" || "error" in summary) {
            return { ...card, certBadges: [] };
          }
          const certs = Array.isArray(summary.certifications) ? summary.certifications : [];
          return {
            ...card,
            certBadges: certs
              .filter(
                (c: { badgeUrl?: string | null }) =>
                  typeof c?.badgeUrl === "string" && c.badgeUrl.length > 0
              )
              .map((c: { title?: string; badgeUrl?: string | null }) => ({
                title: c.title ?? "Certificate",
                badgeUrl: c.badgeUrl ?? null,
              })),
          };
        } catch {
          return { ...card, certBadges: [] };
        }
      })
    );
  }

  const [techniciansWithBadges, csrsWithBadges, salesWithBadges] = await Promise.all([
    withCertBadges(technicians),
    withCertBadges(csrs),
    withCertBadges(salespeople),
  ]);

  return {
    range,
    rangeLabel,
    company,
    technicians: techniciansWithBadges,
    csrs: csrsWithBadges,
    crews: crewCards,
    salespeople: salesWithBadges,
  };
}
