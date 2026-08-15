import { InvoiceStatus, VisitStatus } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import { z } from "zod";
import type { SessionUser } from "@/lib/api-auth";
import { getAvailableSlots } from "@/lib/booking/availability";
import { canViewProfitMargins, employeeSelectFields, isFieldRole } from "@/lib/employees";
import { fieldVisitAssigneeWhere } from "@/lib/field/access";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { getInvoiceForCompany, listInvoices } from "@/lib/invoices/queries";
import { prisma } from "@/lib/prisma";
import { getKpiDashboardReport } from "@/lib/reporting/kpi-dashboard";
import { getInsightsReport, getTechPerformanceReport } from "@/lib/reporting/queries";
import type { ReportRangeInput } from "@/lib/reporting/date-range";
import { resolveReportRange } from "@/lib/reporting/date-range";
import { getEmployeeWorkSchedule } from "@/lib/schedule/time-off";
import {
  getCustomerForCompany,
  listCustomers,
  serializeCustomer,
} from "@/lib/customers/queries";
import { getCustomerSummary } from "@/lib/customers/summary";
import { listVisits, serializeVisit, visitInclude } from "@/lib/visits/queries";
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
  args: Record<string, unknown>
): Promise<StormAiToolResult> {
  try {
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
        const range = parseRange(args.range);
        const kpi = await getKpiDashboardReport(user.companyId, range);
        const requestedTech =
          typeof args.technicianId === "string" ? args.technicianId : undefined;

        if (isFieldRole(user.role)) {
          const card = kpi.technicians.find((t) => t.id === user.id);
          return ok({
            range: kpi.rangeLabel,
            technician: card ?? { id: user.id, name: user.name, metrics: [] },
          });
        }

        if (user.role === "CSR") {
          return ok({
            range: kpi.rangeLabel,
            company: kpi.company,
            note: "Per-technician pay-like cards are not available for your role.",
          });
        }

        if (!officeCanSeeOtherTechs(user.role)) {
          return fail("FORBIDDEN", "Your role cannot access that.");
        }

        if (requestedTech) {
          const card = kpi.technicians.find((t) => t.id === requestedTech);
          if (!card) {
            const report = await getTechPerformanceReport(user.companyId);
            const row = report.rows?.find((r: { id: string }) => r.id === requestedTech);
            if (!row) return fail("NOT_FOUND", "Technician performance not found");
            return ok({ range: kpi.rangeLabel, technician: row });
          }
          return ok({ range: kpi.rangeLabel, technician: card });
        }

        return ok({
          range: kpi.rangeLabel,
          technicians: kpi.technicians,
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

        return ok({
          scope: "company",
          range: kpi.rangeLabel,
          company: kpi.company,
          schedule,
          insights,
          technicians,
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
        const search = typeof args.search === "string" ? args.search : undefined;
        const sent = await listInvoices(user.companyId, {
          customerId,
          status: InvoiceStatus.SENT,
          search,
        });
        const partial = await listInvoices(user.companyId, {
          customerId,
          status: InvoiceStatus.PARTIAL,
          search,
        });
        return ok({
          invoices: [...sent, ...partial].slice(0, 50).map(stripInvoice),
        });
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
