import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
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
import { parseReportRangeFromSearchParams } from "@/lib/reporting/date-range";
import { getKpiDashboardReport } from "@/lib/reporting/kpi-dashboard";

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
    const { type } = await params;

    if (type === "kpi-dashboard") {
      try {
        const rangeInput = parseReportRangeFromSearchParams(request.nextUrl.searchParams);
        const data = await getKpiDashboardReport(user.companyId, rangeInput);
        return NextResponse.json(data);
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
