import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canViewSalesPipeline } from "@/lib/customers/permissions";
import {
  exportSalesPipeline,
  querySalesPipeline,
  type PipelineFilters,
  type PipelineSpeedFilter,
} from "@/lib/customers/pipeline-report";

const SPEED_FILTERS = new Set<PipelineSpeedFilter>(["UNDER_5", "FIVE_TO_30", "OVER_30"]);

function parseDate(value: string | null, endExclusive = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return undefined;
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function filtersFromRequest(request: NextRequest): PipelineFilters {
  const params = request.nextUrl.searchParams;
  const speed = params.get("speed") as PipelineSpeedFilter | null;
  return {
    search: params.get("search") || undefined,
    city: params.get("city") || undefined,
    zip: params.get("zip") || undefined,
    createdFrom: parseDate(params.get("createdFrom")),
    createdTo: parseDate(params.get("createdTo"), true),
    speed: speed && SPEED_FILTERS.has(speed) ? speed : undefined,
  };
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDate(value: Date | null) {
  return value?.toISOString() ?? "";
}

function speedLabel(seconds: number | null) {
  if (seconds == null) return "";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    if (!canViewSalesPipeline(user.role)) return forbiddenResponse();

    const filters = filtersFromRequest(request);
    if (request.nextUrl.searchParams.get("format") === "csv") {
      const rows = await exportSalesPipeline(user.companyId, filters);
      const header = [
        "Customer Name",
        "City",
        "ZIP",
        "Customer Created",
        "Current Stage",
        "Lead At",
        "Lead Source",
        "Speed to Lead",
        "Qualified At",
        "Converted At",
        "Sold At",
        "Disqualified At",
      ];
      const csv = [
        header.map(csvCell).join(","),
        ...rows.map((row) =>
          [
            row.name,
            row.city,
            row.zip,
            csvDate(row.createdAt),
            row.pipelineStage,
            csvDate(row.pipelineLeadAt),
            row.pipelineLeadSource,
            speedLabel(row.speedSeconds),
            csvDate(row.pipelineQualifiedAt),
            csvDate(row.pipelineConvertedAt),
            csvDate(row.pipelineSoldAt),
            csvDate(row.pipelineDisqualifiedAt),
          ].map(csvCell).join(",")
        ),
      ].join("\r\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sales-pipeline-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const page = Math.max(1, Math.floor(Number(request.nextUrl.searchParams.get("page")) || 1));
    const pageSize = 100;
    const result = await querySalesPipeline(user.companyId, filters, {
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return NextResponse.json({ ...result, page, pageSize });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Sales pipeline report failed", error);
    return NextResponse.json({ error: "Could not load the sales pipeline" }, { status: 500 });
  }
}
