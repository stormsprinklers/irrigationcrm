import { VisitStatus } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import { z } from "zod";
import type { SessionUser } from "@/lib/api-auth";
import { getAvailableSlots } from "@/lib/booking/availability";
import { canViewProfitMargins, employeeSelectFields, isFieldRole } from "@/lib/employees";
import { fieldVisitAssigneeWhere } from "@/lib/field/access";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { getInvoiceForCompany, getOutstandingReceivables } from "@/lib/invoices/queries";
import { prisma } from "@/lib/prisma";
import { getKpiDashboardReport } from "@/lib/reporting/kpi-dashboard";
import { getInsightsReport } from "@/lib/reporting/queries";
import type { ReportRangeInput } from "@/lib/reporting/date-range";
import { resolveReportRange } from "@/lib/reporting/date-range";
import { getEmployeeWorkSchedule } from "@/lib/schedule/time-off";
import {
  getCustomerForCompany,
  listCustomers,
  serializeCustomer,
} from "@/lib/customers/queries";
import { getCustomerSummary } from "@/lib/customers/summary";
import { getMaintenancePlanRevenueSummary } from "@/lib/maintenance-plans/queries";
import { listItems } from "@/lib/price-book/queries";
import { listVisits, serializeVisit, visitInclude } from "@/lib/visits/queries";
import {
  getTechnicianKpis,
  getTechnicianLeaderboard,
  resolveCompanyTechnician,
  wantsTechnicianLeaderboard,
} from "./technician-kpis";
import { getMarketingChannelMetrics } from "./marketing-metrics";
import { getInboundCallCoachingReport } from "./call-coaching";
import { canUseStormAiTool, canUseTechAssist } from "./permissions";
import {
  continueTechAssistSession,
  getActiveTechAssistSession,
  matchTechIssues,
  startTechAssistSession,
} from "./tech-assist";
import { getPartsInfoDetail, searchPartsInfo } from "./parts-info";
import { applyPartsVisionMatch, visualMatchNote } from "./parts-vision-match";
import { getCompanyPolicy, searchCompanyPolicies } from "./policies";
import { getStormAiVehicleReport } from "./vehicles";
import { canViewVehicles } from "@/lib/vehicles/permissions";
import type { StormAiToolResult } from "./types";

const rangeSchema = z
  .object({
    preset: z
      .enum(["today", "week", "month", "mtd", "ytd", "last30", "overall", "custom"])
      .optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  })
  .optional();

function fail(
  code: "NOT_FOUND" | "FORBIDDEN" | "UNAVAILABLE" | "INVALID",
  error: string
): StormAiToolResult {
  return { ok: false, code, error };
}

function ok(data: unknown): StormAiToolResult {
  return { ok: true, data };
}

function parseRange(raw: unknown): ReportRangeInput {
  const parsed = rangeSchema.safeParse(raw);
  if (!parsed.success) return { preset: "mtd" };
  const r = parsed.data;
  if (!r?.preset) return { preset: "mtd" };
  if (r.preset === "custom" && r.start && r.end) {
    return { preset: "custom", start: r.start, end: r.end };
  }
  if (r.preset === "custom") return { preset: "mtd" };
  return { preset: r.preset };
}

function stripInvoice(invoice: Awaited<ReturnType<typeof getInvoiceForCompany>>) {
  if (!invoice) return null;
  const { publicToken: _token, ...rest } = invoice;
  return rest;
}

function officeCanSeeOtherTechs(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

async function loadTech(companyId: string, technicianId: string) {
  return prisma.user.findFirst({
    where: { id: technicianId, companyId, status: "ACTIVE" },
    select: employeeSelectFields(),
  });
}

function publicTech(tech: NonNullable<Awaited<ReturnType<typeof loadTech>>>) {
  return {
    id: tech.id,
    name: tech.name,
    role: tech.role,
    title: tech.title,
    division: tech.division,
    color: tech.color,
    photoUrl: tech.photoUrl,
    phone: tech.phone,
    status: tech.status,
    serviceAreas: tech.serviceAreas.map((row) => row.serviceArea),
    crews: tech.crewMemberships.map((row) => row.crew),
  };
}

async function fieldVisitWhere(user: SessionUser) {
  return fieldVisitAssigneeWhere(user.companyId, user.id);
}

export async function runStormAiTool(
  user: SessionUser,
  name: string,
  args: Record<string, unknown>,
  ctx?: { conversationId?: string }
): Promise<StormAiToolResult> {
  try {
    if (!canUseStormAiTool(user.role, name)) {
      return fail("FORBIDDEN", "Your role cannot access that.");
    }
    switch (name) {
      case "search_customers": {
        const query = typeof args.query === "string" ? args.query : "";
        const city = typeof args.city === "string" ? args.city : undefined;
        const zip = typeof args.zip === "string" ? args.zip : undefined;
        const rows = await listCustomers(user.companyId, {
          search: query || undefined,
          city,
          zip,
          status: "ACTIVE",
        });
        return ok({
          customers: rows.slice(0, 20).map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            city: c.city,
            zip: c.zip,
            address: c.address,
            status: c.status,
          })),
        });
      }
      case "get_customer": {
        const customerId = String(args.customerId ?? "");
        if (!customerId) return fail("INVALID", "customerId is required");
        const customer = await getCustomerForCompany(user.companyId, customerId);
        if (!customer) return fail("NOT_FOUND", "Customer not found");
        const summary = await getCustomerSummary(user.companyId, customerId);
        const serialized = serializeCustomer(customer);
        const summaryOut = summary
          ? {
              createdAt: summary.createdAt,
              lastVisitAt: summary.lastVisitAt,
              lifetimeValue: summary.lifetimeValue,
              outstandingBalance: canAccessInvoices(user.role)
                ? summary.outstandingBalance
                : undefined,
              lifetimeGrossProfit: canViewProfitMargins(user.role)
                ? summary.lifetimeGrossProfit
                : undefined,
            }
          : null;
        return ok({ customer: serialized, summary: summaryOut });
      }
      case "get_customer_history": {
        const customerId = String(args.customerId ?? "");
        if (!customerId) return fail("INVALID", "customerId is required");
        const customer = await prisma.customer.findFirst({
          where: { id: customerId, companyId: user.companyId },
          select: { id: true },
        });
        if (!customer) return fail("NOT_FOUND", "Customer not found");

        const visitWhere = isFieldRole(user.role)
          ? { AND: [{ customerId, companyId: user.companyId }, await fieldVisitWhere(user)] }
          : { companyId: user.companyId, customerId };

        const [visits, estimates, invoices] = await Promise.all([
          prisma.visit.findMany({
            where: {
              ...visitWhere,
              status: { not: VisitStatus.CANCELLED },
            },
            select: {
              id: true,
              title: true,
              startAt: true,
              status: true,
              assignedUser: { select: { id: true, name: true } },
            },
            orderBy: { startAt: "desc" },
            take: 40,
          }),
          prisma.estimate.findMany({
            where: { companyId: user.companyId, customerId },
            select: {
              id: true,
              status: true,
              total: true,
              visitId: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 40,
          }),
          canAccessInvoices(user.role)
            ? prisma.invoice.findMany({
                where: { companyId: user.companyId, customerId },
                select: {
                  id: true,
                  invoiceNumber: true,
                  status: true,
                  total: true,
                  createdAt: true,
                },
                orderBy: { createdAt: "desc" },
                take: 40,
              })
            : Promise.resolve([]),
        ]);

        return ok({
          visits: visits.map((row) => ({
            ...row,
            startAt: row.startAt.toISOString(),
          })),
          estimates,
          invoices: canAccessInvoices(user.role) ? invoices : undefined,
        });
      }
      case "get_schedule": {
        const start = args.start ? new Date(String(args.start)) : startOfDay(new Date());
        const end = args.end ? new Date(String(args.end)) : addDays(start, 7);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return fail("INVALID", "Invalid start or end");
        }

        const requestedTech =
          typeof args.technicianId === "string" ? args.technicianId : undefined;
        if (isFieldRole(user.role) && requestedTech && requestedTech !== user.id) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }

        if (isFieldRole(user.role)) {
          const assignee = await fieldVisitWhere(user);
          const visits = await prisma.visit.findMany({
            where: {
              ...assignee,
              startAt: { lt: end },
              endAt: { gt: start },
            },
            include: visitInclude,
            orderBy: { startAt: "asc" },
            take: 80,
          });
          return ok({ visits: visits.map(serializeVisit) });
        }

        const filters = requestedTech
          ? { serviceAreaIds: [], userIds: [requestedTech], crewIds: [], divisions: [] as ("INSTALL" | "SERVICE")[] }
          : undefined;
        const visits = await listVisits(user.companyId, start, end, filters);
        return ok({ visits: visits.slice(0, 80) });
      }
      case "get_availability": {
        const requestedTech =
          typeof args.technicianId === "string" ? args.technicianId : user.id;
        if (isFieldRole(user.role) && requestedTech !== user.id) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const tech = await loadTech(user.companyId, requestedTech);
        if (!tech) return fail("NOT_FOUND", "Technician not found");

        const company = await prisma.company.findUnique({
          where: { id: user.companyId },
          select: {
            businessHours: true,
            bookingLeadTimeHours: true,
            timezone: true,
          },
        });
        if (!company) return fail("UNAVAILABLE", "Company not found");

        const days = typeof args.days === "number" ? Math.min(21, Math.max(1, args.days)) : 14;
        const [slots, workSchedule] = await Promise.all([
          getAvailableSlots({
            companyId: user.companyId,
            businessHours: company.businessHours,
            bookingLeadTimeHours: company.bookingLeadTimeHours,
            timeZone: company.timezone,
            days,
          }),
          getEmployeeWorkSchedule(user.companyId, requestedTech),
        ]);
        return ok({
          technician: { id: tech.id, name: tech.name },
          workSchedule,
          slots: slots.slice(0, 40),
        });
      }
      case "get_technician": {
        const technicianId =
          typeof args.technicianId === "string" ? args.technicianId : user.id;
        if (isFieldRole(user.role) && technicianId !== user.id) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const tech = await loadTech(user.companyId, technicianId);
        if (!tech) return fail("NOT_FOUND", "Technician not found");
        return ok({ technician: publicTech(tech) });
      }
      case "get_technician_performance": {
        const range = args.range != null ? parseRange(args.range) : { preset: "ytd" as const };
        const requestedTech =
          typeof args.technicianId === "string" ? args.technicianId : undefined;
        const requestedName = typeof args.name === "string" ? args.name : undefined;

        if (isFieldRole(user.role)) {
          if (requestedTech && requestedTech !== user.id) {
            return fail("FORBIDDEN", "Your role cannot access that.");
          }
          const kpis = await getTechnicianKpis(user.companyId, user.id, range);
          return ok({
            technician: { id: user.id, name: user.name },
            ...kpis,
          });
        }

        if (wantsTechnicianLeaderboard({ technicianId: requestedTech, name: requestedName })) {
          if (!officeCanSeeOtherTechs(user.role) && user.role !== "SALES" && user.role !== "CSR") {
            return fail("FORBIDDEN", "Your role cannot access that.");
          }
          const board = await getTechnicianLeaderboard(user.companyId, range);
          return ok({
            ...board,
            note: "Active technicians ranked by 5-star CRM survey reviews in this range. Pass a name or technicianId for one person.",
          });
        }

        const resolved = await resolveCompanyTechnician(user.companyId, {
          technicianId: requestedTech,
          name: requestedName,
        });
        if (!resolved.ok) {
          if (resolved.matches.length > 1) {
            return fail(
              "NOT_FOUND",
              `Multiple technicians matched. Ask which one: ${resolved.matches
                .map((m) => `${m.name} (${m.id})`)
                .join(", ")}`
            );
          }
          return fail("NOT_FOUND", "Technician not found");
        }

        const kpis = await getTechnicianKpis(user.companyId, resolved.user.id, range);
        return ok({
          technician: resolved.user,
          ...kpis,
        });
      }
      case "get_revenue_summary":
      case "get_business_performance": {
        const range = parseRange(args.range);
        const resolved = resolveReportRange(range);
        const company = await prisma.company.findUnique({
          where: { id: user.companyId },
          select: { monthlyRevenueTarget: true, timezone: true },
        });
        const target =
          company?.monthlyRevenueTarget != null
            ? Number(company.monthlyRevenueTarget)
            : null;

        if (isFieldRole(user.role)) {
          const assignee = await fieldVisitWhere(user);
          const visits = await prisma.visit.findMany({
            where: {
              ...assignee,
              startAt: { gte: resolved.start, lte: resolved.end },
            },
            include: { lineItems: true, discounts: true },
          });
          const completed = visits.filter((v) => v.status === VisitStatus.COMPLETED);
          const scheduled = visits.filter((v) => v.status !== VisitStatus.CANCELLED);
          const { sumDiscounts, sumLineItems } = await import("@/lib/visits/totals");
          let completedRevenue = 0;
          let scheduledRevenue = 0;
          for (const v of completed) {
            const sub = sumLineItems(v.lineItems);
            completedRevenue += Math.max(0, sub - sumDiscounts(sub, v.discounts));
          }
          for (const v of scheduled) {
            const sub = sumLineItems(v.lineItems);
            scheduledRevenue += Math.max(0, sub - sumDiscounts(sub, v.discounts));
          }
          return ok({
            scope: "self",
            range: resolved.label,
            completedVisitCount: completed.length,
            scheduledVisitCount: scheduled.length,
            completedRevenue,
            scheduledRevenue,
            monthlyRevenueTarget: null,
            targetNote:
              "Monthly revenue target is a company metric and is not shown for field roles.",
          });
        }

        const kpi = await getKpiDashboardReport(user.companyId, range);
        const { getScheduleSummary } = await import("@/lib/visits/queries");
        const schedule = await getScheduleSummary(
          user.companyId,
          resolved.start,
          resolved.end
        );
        let insights: unknown = undefined;
        if (name === "get_business_performance") {
          try {
            insights = await getInsightsReport(user.companyId);
          } catch {
            insights = { error: "Insights were unavailable." };
          }
        }

        const mtdBehind =
          target != null && Number.isFinite(target)
            ? {
                monthlyRevenueTarget: target,
                note: "Compare MTD collected/scheduled figures from this payload to the target. Do not invent other target numbers.",
              }
            : {
                monthlyRevenueTarget: null,
                note: "The CRM does not track a monthly revenue target unless it is set in Settings → Company.",
              };

        const technicians =
          officeCanSeeOtherTechs(user.role) && name === "get_business_performance"
            ? kpi.technicians
            : undefined;

        const outstanding = canAccessInvoices(user.role)
          ? await getOutstandingReceivables(user.companyId)
          : null;

        return ok({
          scope: "company",
          range: kpi.rangeLabel,
          company: kpi.company,
          schedule,
          insights,
          technicians,
          outstandingInvoiceBalance: outstanding
            ? {
                totalOutstanding: outstanding.totalOutstanding,
                invoiceCount: outstanding.invoiceCount,
                note: "This is the full remaining balance on draft, sent, and partial invoices. Prefer this over any Open AR figure in insights.",
              }
            : undefined,
          ...mtdBehind,
        });
      }
      case "get_invoice": {
        if (!canAccessInvoices(user.role)) {
          return fail("FORBIDDEN", "Invoices are not available for your role.");
        }
        const invoiceId = String(args.invoiceId ?? "");
        if (!invoiceId) return fail("INVALID", "invoiceId is required");
        const invoice = await getInvoiceForCompany(user.companyId, invoiceId);
        if (!invoice) return fail("NOT_FOUND", "Invoice not found");
        return ok({ invoice: stripInvoice(invoice) });
      }
      case "get_unpaid_invoices": {
        if (!canAccessInvoices(user.role)) {
          return fail("FORBIDDEN", "Invoices are not available for your role.");
        }
        const customerId =
          typeof args.customerId === "string" ? args.customerId : undefined;
        const data = await getOutstandingReceivables(user.companyId, { customerId });
        return ok({
          totalOutstanding: data.totalOutstanding,
          invoiceCount: data.invoiceCount,
          invoices: data.invoices,
          note: "totalOutstanding is the full remaining balance on all unpaid invoices (draft, sent, and partial). The invoices array is only the largest balances — do not sum it.",
        });
      }
      case "get_marketing_metrics": {
        if (isFieldRole(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const range =
          args.range != null ? parseRange(args.range) : { preset: "last30" as const };
        const channel = typeof args.channel === "string" ? args.channel : undefined;
        const data = await getMarketingChannelMetrics(user.companyId, range, channel);
        return ok(data);
      }
      case "get_maintenance_plan_metrics": {
        if (isFieldRole(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const data = await getMaintenancePlanRevenueSummary(user.companyId);
        return ok(data);
      }
      case "search_price_book": {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (query.length < 2) {
          return fail("INVALID", "Search query must be at least 2 characters");
        }
        const typeRaw = typeof args.type === "string" ? args.type.toUpperCase() : "";
        const type =
          typeRaw === "SERVICE" || typeRaw === "MATERIAL"
            ? (typeRaw as "SERVICE" | "MATERIAL")
            : undefined;
        const showCost = canViewProfitMargins(user.role);
        const items = await listItems({
          companyId: user.companyId,
          q: query,
          type,
          activeOnly: true,
          take: 25,
        });
        return ok({
          query,
          count: items.length,
          items: items.map((item) => {
            const price =
              item.pricingMode === "CALCULATED" && item.lastCalculatedPrice != null
                ? item.lastCalculatedPrice
                : item.unitPrice;
            return {
              id: item.id,
              name: item.name,
              type: item.type,
              sku: item.sku,
              description: item.description
                ? item.description.slice(0, 280)
                : null,
              category: item.category?.name ?? null,
              unit: item.unit,
              price,
              taxable: item.taxable,
              pricingMode: item.pricingMode,
              ...(showCost
                ? {
                    unitCost: item.unitCost,
                    laborHours: item.laborHours,
                    laborRate: item.laborRate,
                  }
                : {}),
              materials: item.materials?.map((link) => ({
                name: link.material.name,
                quantity: link.quantity,
                unit: link.material.unit,
                ...(showCost ? { unitPrice: link.material.unitPrice } : {}),
              })),
            };
          }),
          note: "price is the customer sell price. Costs are omitted unless the user can view margins.",
        });
      }
      case "analyze_inbound_calls": {
        if (isFieldRole(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const range =
          args.range != null ? parseRange(args.range) : { preset: "last30" as const };
        const employeeName =
          typeof args.employeeName === "string" ? args.employeeName : undefined;
        const leadSource = typeof args.leadSource === "string" ? args.leadSource : undefined;
        const callId = typeof args.callId === "string" ? args.callId : undefined;
        const includeTranscripts =
          typeof args.includeTranscripts === "boolean" ? args.includeTranscripts : undefined;
        const data = await getInboundCallCoachingReport(user.companyId, range, {
          employeeName,
          leadSource,
          callId,
          includeTranscripts,
        });
        if (callId && "call" in data && data.call == null) {
          return fail("NOT_FOUND", "Call not found");
        }
        return ok(data);
      }
      case "match_tech_issue": {
        if (!canUseTechAssist(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const query = typeof args.query === "string" ? args.query : "";
        const issues = await matchTechIssues(user.companyId, query);
        return ok({
          issues,
          note:
            issues.length === 0
              ? "No matching technician workflow. Do not invent a procedure."
              : "Pick the best issueId and call start_tech_assist. Do not invent steps.",
        });
      }
      case "get_active_tech_assist": {
        if (!canUseTechAssist(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const conversationId = ctx?.conversationId;
        if (!conversationId) return fail("INVALID", "Conversation is required");
        const active = await getActiveTechAssistSession({
          companyId: user.companyId,
          userId: user.id,
          conversationId,
        });
        return ok(active);
      }
      case "start_tech_assist": {
        if (!canUseTechAssist(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const issueId = typeof args.issueId === "string" ? args.issueId : "";
        const conversationId = ctx?.conversationId;
        if (!issueId) return fail("INVALID", "issueId is required");
        if (!conversationId) return fail("INVALID", "Conversation is required");
        const started = await startTechAssistSession({
          companyId: user.companyId,
          userId: user.id,
          conversationId,
          issueId,
        });
        if (!started.ok) return fail("NOT_FOUND", started.error);
        return ok(started);
      }
      case "continue_tech_assist": {
        if (!canUseTechAssist(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const sessionId = typeof args.sessionId === "string" ? args.sessionId : "";
        if (!sessionId) return fail("INVALID", "sessionId is required");
        const continued = await continueTechAssistSession({
          companyId: user.companyId,
          userId: user.id,
          sessionId,
          result: args.result,
        });
        if (!continued.ok) return fail("NOT_FOUND", continued.error);
        return ok(continued);
      }
      case "search_parts_info": {
        if (!canUseTechAssist(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const query = typeof args.query === "string" ? args.query : "";
        const textHits = await searchPartsInfo(user.companyId, query);
        const compared = ctx?.conversationId
          ? await applyPartsVisionMatch({
              companyId: user.companyId,
              conversationId: ctx.conversationId,
              parts: textHits,
            })
          : { parts: textHits, visualMatch: { ran: false, confirmed: false, partId: null, photoId: null, confidence: null, reason: null } };
        return ok({
          query,
          count: compared.parts.length,
          parts: compared.parts,
          visualMatch: compared.visualMatch,
          note: visualMatchNote(compared.visualMatch, compared.parts.length),
        });
      }
      case "get_parts_info": {
        if (!canUseTechAssist(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const partId = typeof args.partId === "string" ? args.partId : "";
        if (!partId) return fail("INVALID", "partId is required");
        const part = await getPartsInfoDetail(user.companyId, partId);
        if (!part) return fail("NOT_FOUND", "Part not found");
        return ok({
          part,
          note: "Answer the technician in a few sentences using this record. Never paste visualDescription. Never paste the full technicalDescription. If manualUrl is present, share it as [Open manual](manualUrl). Do not invent specs.",
        });
      }
      case "search_company_policies": {
        const query = typeof args.query === "string" ? args.query : "";
        const policies = await searchCompanyPolicies(user.companyId, query);
        return ok({
          query,
          count: policies.length,
          policies,
          note:
            policies.length === 0
              ? "No matching company policy. Do not invent company rules for safety, property damage, technical standards, customer authorization, pricing/payments, or employee operations."
              : "Follow these policies. They override generic advice. Do not add rules that are not written here.",
        });
      }
      case "get_company_policy": {
        const policyId = typeof args.policyId === "string" ? args.policyId : "";
        if (!policyId) return fail("INVALID", "policyId is required");
        const policy = await getCompanyPolicy(user.companyId, policyId);
        if (!policy) return fail("NOT_FOUND", "Policy not found");
        return ok({
          policy,
          note: "Follow this policy exactly. Do not invent additional company rules.",
        });
      }
      case "get_vehicles": {
        if (!canViewVehicles(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }
        const query = typeof args.query === "string" ? args.query.trim() : undefined;
        const vehicleId = typeof args.vehicleId === "string" ? args.vehicleId : undefined;
        const focus = typeof args.focus === "string" ? args.focus : undefined;
        const data = await getStormAiVehicleReport(user.companyId, {
          query: query || undefined,
          vehicleId,
          focus,
        });
        if (vehicleId && !data.detail && data.vehicles.length === 0) {
          return fail("NOT_FOUND", "Vehicle not found");
        }
        return ok(data);
      }
      default:
        return fail("INVALID", `Unknown tool: ${name}`);
    }
  } catch (err) {
    return fail(
      "UNAVAILABLE",
      err instanceof Error ? err.message : "I wasn’t able to retrieve that report."
    );
  }
}
