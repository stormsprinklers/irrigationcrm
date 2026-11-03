import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canViewReporting } from "@/lib/settings/access";
import {
  getCsrReport,
  getEstimatesReport,
  getFinancialReport,
  getInsightsReport,
  getInvoicesReport,
  getLeadsReport,
  getPaymentsReport,
  getServicePlansChurn,
  getTechPerformanceReport,
  getVoiceReport,
} from "@/lib/reporting/queries";
import { parseReportRangeFromSearchParams, resolveReportRange } from "@/lib/reporting/date-range";
import { getKpiDashboardReport } from "@/lib/reporting/kpi-dashboard";
import { getHolidayLightingSalesReport } from "@/lib/reporting/holiday-lighting-sales";

type RouteParams = { params: Promise<{ type: string }> };

const handlers: Record<string, (companyId: string) => Promise<unknown>> = {
  insights: getInsightsReport,
  "tech-performance": getTechPerformanceReport,
  financial: getFinancialReport,
  csr: getCsrReport,
  estimates: getEstimatesReport,
  leads: getLeadsReport,
  voice: getVoiceReport,
  invoices: getInvoicesReport,
  payments: getPaymentsReport,
  "service-plans-churn": getServicePlansChurn,
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    if (!canViewReporting(user.role)) return forbiddenResponse();
    const { type } = await params;

    if (type === "kpi-dashboard") {
      try {
        const rangeInput = parseReportRangeFromSearchParams(request.nextUrl.searchParams);
        const data = await getKpiDashboardReport(
          user.companyId,
          rangeInput,
          request.nextUrl.searchParams.get("overview") === "1"
        );
        return NextResponse.json(data);
      } catch {
        return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
      }
    }

    if (type === "holiday-lighting-sales") {
      try {
        const range = resolveReportRange(
          parseReportRangeFromSearchParams(request.nextUrl.searchParams)
        );
        const data = await getHolidayLightingSalesReport(user.companyId, range);
        return NextResponse.json({ ...data, currentUserId: user.id });
      } catch {
        return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
      }
    }

    const handler = handlers[type];
    if (!handler) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    const data = await handler(user.companyId);
    return NextResponse.json(data);
  } catch {
    return unauthorizedResponse();
  }
}
