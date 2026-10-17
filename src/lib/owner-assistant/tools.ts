import { Division, VisitStatus } from "@prisma/client";
import { writeStaffAuditLog } from "@/lib/audit/staff-audit";
import { normalizePhone } from "@/lib/inbox/contacts";
import { onVisitCancelled, onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { prisma } from "@/lib/prisma";
import { validateAssignmentUpdate } from "@/lib/schedule/time-off";
import { runStormAiTool } from "@/lib/storm-ai/execute";
import { resolveOwnerCompanyUser, listOwnerAssistantCompanies } from "./access";
import { formatOwnerAssistantAppointment } from "./appointment-label";
import { hashOwnerAssistantToolArgs } from "./auth";
import { matchOwnerAssistantEmployee } from "./employee-resolution";
import { OWNER_ASSISTANT_TOOL_NAMES, type OwnerAssistantToolName } from "./types";
import { validateOwnerAssistantVisitTime } from "./visit-time";

type Context = { configId: string; ownerUserId: string; sessionId?: string | null };
type Result = { ok: boolean; data?: unknown; error?: string; code?: string };

const MUTATING = new Set<OwnerAssistantToolName>([
  "create_customer",
  "create_visit",
  "reschedule_visit",
  "cancel_visit",
  "add_customer_note",
]);

function invalid(error: string, code = "INVALID"): Result {
  return { ok: false, error, code };
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function textList(value: unknown, maxItems = 20, maxLength = 160): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, maxLength))
        .filter(Boolean)
    ),
  ].slice(0, maxItems);
}

async function execute(ctx: Context, tool: OwnerAssistantToolName, args: Record<string, unknown>): Promise<Result> {
  const owner = await prisma.user.findUnique({
    where: { id: ctx.ownerUserId },
    select: { id: true, companyId: true, email: true, status: true, role: true },
  });
  if (!owner || owner.status !== "ACTIVE" || owner.role !== "ADMIN") return invalid("Owner access is no longer active", "FORBIDDEN");

  if (tool === "list_companies") {
    const companies = await listOwnerAssistantCompanies(owner);
    return { ok: true, data: { companies: companies.map(({ companyId, companyName }) => ({ companyId, companyName })) } };
  }

  const companyId = text(args.companyId, 128);
  if (!companyId) return invalid("companyId is required");
  const companyUser = await resolveOwnerCompanyUser(ctx.ownerUserId, companyId);
  if (!companyUser) return invalid("That company is not available to this assistant", "FORBIDDEN");

  if (tool === "resolve_visit_time") {
    const visitTime = validateOwnerAssistantVisitTime(args.startAt, args.endAt);
    if (!visitTime.ok) return invalid(visitTime.error, visitTime.code);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    });
    return {
      ok: true,
      data: {
        startAt: visitTime.startAt.toISOString(),
        endAt: visitTime.endAt.toISOString(),
        ...formatOwnerAssistantAppointment(
          visitTime.startAt,
          visitTime.endAt,
          company?.timezone
        ),
      },
    };
  }

  if (tool === "list_employees") {
    const query = text(args.query, 160);
    const employees = await prisma.user.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        systemKind: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { firstName: { contains: query, mode: "insensitive" } },
                { lastName: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 100,
      select: { id: true, name: true, email: true, role: true, division: true },
    });
    return { ok: true, data: { employees } };
  }

  if (!MUTATING.has(tool)) {
    const { companyId: _companyId, ...toolArgs } = args;
    const result = await runStormAiTool({
      id: companyUser.id,
      companyId,
      email: companyUser.email,
      name: companyUser.name,
      role: "ADMIN",
    }, tool, toolArgs);
    if (tool !== "get_schedule" || !result.ok) return result;

    const data = result.data && typeof result.data === "object"
      ? result.data as { visits?: unknown[] }
      : {};
    if (!Array.isArray(data.visits)) return result;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    });
    return {
      ok: true,
      data: {
        ...data,
        visits: data.visits.map((rawVisit) => {
          if (!rawVisit || typeof rawVisit !== "object") return rawVisit;
          const visit = rawVisit as Record<string, unknown>;
          const startAt = typeof visit.startAt === "string" ? new Date(visit.startAt) : null;
          const endAt = typeof visit.endAt === "string" ? new Date(visit.endAt) : null;
          if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
            return visit;
          }
          return {
            ...visit,
            ...formatOwnerAssistantAppointment(startAt, endAt, company?.timezone),
          };
        }),
      },
    };
  }

  if (args.confirmed !== true) return invalid("Explicit owner confirmation is required", "NOT_CONFIRMED");

  if (tool === "create_customer") {
    const name = text(args.name, 160);
    if (!name) return invalid("Customer name is required");
    const phone = text(args.phone, 40) ? normalizePhone(text(args.phone, 40)) : null;
    const email = text(args.email, 200).toLowerCase() || null;
    if (phone || email) {
      const duplicate = await prisma.customer.findFirst({
        where: { companyId, OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
        select: { id: true, name: true, phone: true, email: true },
      });
      if (duplicate) return invalid(`A matching customer already exists: ${duplicate.name} (${duplicate.id})`, "DUPLICATE");
    }
    const customer = await prisma.customer.create({
      data: {
        companyId,
        name,
        phone,
        email,
        address: text(args.address, 240) || null,
        city: text(args.city, 100) || null,
        state: text(args.state, 40) || null,
        zip: text(args.zip, 20) || null,
        leadSource: text(args.leadSource, 100) || "Owner assistant",
      },
      select: { id: true, name: true, phone: true, email: true },
    });
    return { ok: true, data: { customer } };
  }

  if (tool === "add_customer_note") {
    const customerId = text(args.customerId, 128);
    const body = text(args.body, 4000);
    if (!customerId || !body) return invalid("customerId and note body are required");
    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
    if (!customer) return invalid("Customer not found", "NOT_FOUND");
    const note = await prisma.customerNote.create({
      data: { customerId, authorId: companyUser.id, body },
      select: { id: true, createdAt: true },
    });
    return { ok: true, data: { note } };
  }

  if (tool === "reschedule_visit" || tool === "cancel_visit") {
    const visitId = text(args.visitId, 128);
    if (!visitId) return invalid("visitId is required");
    const existing = await prisma.visit.findFirst({
      where: { id: visitId, companyId },
      select: {
        id: true,
        title: true,
        status: true,
        startAt: true,
        endAt: true,
        customerId: true,
        propertyId: true,
        assignedUserId: true,
        customer: { select: { id: true, name: true } },
        additionalAssignees: { select: { userId: true } },
      },
    });
    if (!existing) return invalid("Visit not found", "NOT_FOUND");
    if (existing.status !== VisitStatus.SCHEDULED) {
      return invalid(
        existing.status === VisitStatus.CANCELLED
          ? "That visit is already cancelled"
          : `Only scheduled visits can be ${tool === "cancel_visit" ? "cancelled" : "rescheduled"}; this visit is ${existing.status.toLowerCase()}`,
        existing.status === VisitStatus.CANCELLED ? "ALREADY_CANCELLED" : "INVALID_STATUS"
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    });
    const existingLabel = formatOwnerAssistantAppointment(
      existing.startAt,
      existing.endAt,
      company?.timezone
    );

    if (tool === "cancel_visit") {
      const updated = await prisma.visit.updateMany({
        where: { id: visitId, companyId, status: VisitStatus.SCHEDULED },
        data: { status: VisitStatus.CANCELLED },
      });
      if (updated.count !== 1) {
        return invalid("The visit changed before it could be cancelled. Check the schedule and try again.", "CONFLICT");
      }
      const reason = text(args.reason, 1000);
      if (reason) {
        await prisma.visitNote.create({
          data: {
            visitId,
            authorId: companyUser.id,
            body: `Cancellation reason: ${reason}`,
          },
        }).catch((error) => {
          console.error("[owner-assistant] cancellation note failed", visitId, error);
        });
      }
      await writeStaffAuditLog({
        companyId,
        actorId: companyUser.id,
        entityType: "Visit",
        entityId: visitId,
        action: "cancel",
        before: { status: existing.status },
        after: { status: VisitStatus.CANCELLED, reason: reason || null },
        customerId: existing.customerId,
        propertyId: existing.propertyId,
        visitId,
      });
      await onVisitCancelled(visitId, companyId).catch((error) => {
        console.error("[owner-assistant] cancellation notification failed", visitId, error);
      });
      return {
        ok: true,
        data: {
          visit: {
            id: existing.id,
            title: existing.title,
            customer: existing.customer,
            startAt: existing.startAt.toISOString(),
            endAt: existing.endAt.toISOString(),
            ...existingLabel,
            status: VisitStatus.CANCELLED,
          },
          customerNotificationAutomationMayRun: true,
        },
      };
    }

    const visitTime = validateOwnerAssistantVisitTime(args.startAt, args.endAt);
    if (!visitTime.ok) return invalid(visitTime.error, visitTime.code);
    const { startAt, endAt } = visitTime;
    if (
      startAt.getTime() === existing.startAt.getTime() &&
      endAt.getTime() === existing.endAt.getTime()
    ) {
      return invalid("The visit is already scheduled for that time", "NO_CHANGE");
    }
    const assignedUserIds = [
      ...(existing.assignedUserId ? [existing.assignedUserId] : []),
      ...existing.additionalAssignees.map((assignment) => assignment.userId),
    ];
    const availability = await Promise.all(
      assignedUserIds.map((employeeId) =>
        validateAssignmentUpdate(companyId, employeeId, startAt, endAt, visitId)
      )
    );
    const unavailable = availability.find((result) => result.error)?.error;
    if (unavailable) return invalid(unavailable, "UNAVAILABLE");
    const updated = await prisma.visit.updateMany({
      where: { id: visitId, companyId, status: VisitStatus.SCHEDULED },
      data: { startAt, endAt },
    });
    if (updated.count !== 1) {
      return invalid("The visit changed before it could be rescheduled. Check the schedule and try again.", "CONFLICT");
    }
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, companyId },
      select: {
        id: true,
        title: true,
        status: true,
        startAt: true,
        endAt: true,
        customer: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, name: true, email: true } },
        additionalAssignees: {
          select: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!visit) return invalid("The rescheduled visit could not be reloaded", "FAILED");
    await writeStaffAuditLog({
      companyId,
      actorId: companyUser.id,
      entityType: "Visit",
      entityId: visitId,
      action: "reschedule",
      before: {
        startAt: existing.startAt.toISOString(),
        endAt: existing.endAt.toISOString(),
      },
      after: { startAt: visit.startAt.toISOString(), endAt: visit.endAt.toISOString() },
      customerId: existing.customerId,
      propertyId: existing.propertyId,
      visitId,
    });
    await onVisitTimeChanged({ visitId, companyId }).catch((error) => {
      console.error("[owner-assistant] reschedule notification failed", visitId, error);
    });
    const { assignedUser, additionalAssignees, ...visitFields } = visit;
    return {
      ok: true,
      data: {
        visit: {
          ...visitFields,
          startAt: visit.startAt.toISOString(),
          endAt: visit.endAt.toISOString(),
          ...formatOwnerAssistantAppointment(visit.startAt, visit.endAt, company?.timezone),
          assignedEmployees: [
            ...(assignedUser ? [assignedUser] : []),
            ...additionalAssignees.map((assignment) => assignment.user),
          ],
        },
        customerNotificationAutomationMayRun: true,
      },
    };
  }

  const customerId = text(args.customerId, 128);
  const title = text(args.title, 200);
  if (!customerId || !title) return invalid("Valid customer and title are required");
  const visitTime = validateOwnerAssistantVisitTime(args.startAt, args.endAt);
  if (!visitTime.ok) return invalid(visitTime.error, visitTime.code);
  const { startAt, endAt } = visitTime;
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
  if (!customer) return invalid("Customer not found", "NOT_FOUND");
  const propertyId = text(args.propertyId, 128) || null;
  const property = propertyId
    ? await prisma.customerProperty.findFirst({ where: { id: propertyId, customerId, companyId } })
    : await prisma.customerProperty.findFirst({ where: { customerId, companyId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
  if (propertyId && !property) return invalid("Property not found", "NOT_FOUND");
  const requestedIds = textList(args.assignedUserIds, 20, 128);
  const legacyAssignedUserId = text(args.assignedUserId, 128);
  if (legacyAssignedUserId) requestedIds.push(legacyAssignedUserId);
  const requestedNames = textList(args.assignedEmployeeNames);
  let assignedUsers: Array<{ id: string; name: string; email: string }> = [];
  if (requestedIds.length || requestedNames.length) {
    const activeEmployees = await prisma.user.findMany({
      where: { companyId, status: "ACTIVE", systemKind: null },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    const byId = new Map(activeEmployees.map((employee) => [employee.id, employee]));
    const resolved: Array<{ id: string; name: string; email: string }> = [];
    for (const id of requestedIds) {
      const employee = byId.get(id);
      if (!employee) return invalid("One of the assigned employees is not active in this company", "NOT_FOUND");
      resolved.push(employee);
    }
    for (const requestedName of requestedNames) {
      const match = matchOwnerAssistantEmployee(activeEmployees, requestedName);
      if (!match.ok && match.reason === "NOT_FOUND") {
        return invalid(`No active employee named "${requestedName}" was found. Use list_employees to check the spelling.`, "NOT_FOUND");
      }
      if (!match.ok) {
        return invalid(`More than one active employee matches "${requestedName}". Use list_employees and select the matching email.`, "AMBIGUOUS");
      }
      resolved.push(match.employee);
    }
    assignedUsers = [...new Map(resolved.map((employee) => [employee.id, employee])).values()];
    if (assignedUsers.length > 20) return invalid("A visit can have up to 20 assigned employees");
    const availability = await Promise.all(
      assignedUsers.map((employee) =>
        validateAssignmentUpdate(companyId, employee.id, startAt, endAt)
      )
    );
    const unavailable = availability.find((result) => result.error)?.error;
    if (unavailable) return invalid(unavailable, "UNAVAILABLE");
  }
  const assignedUserId = assignedUsers[0]?.id ?? null;
  const divisionRaw = text(args.division, 40) || Division.SERVICE;
  if (!Object.values(Division).includes(divisionRaw as Division)) return invalid("Invalid division");
  const visit = await prisma.visit.create({
    data: {
      companyId,
      customerId,
      propertyId: property?.id,
      title,
      startAt,
      endAt,
      division: divisionRaw as Division,
      assignedUserId,
      additionalAssignees:
        assignedUsers.length > 1
          ? { create: assignedUsers.slice(1).map((employee) => ({ userId: employee.id })) }
          : undefined,
      createdByUserId: companyUser.id,
      status: VisitStatus.SCHEDULED,
      address: property?.address,
      city: property?.city,
      state: property?.state,
      zip: property?.zip,
      tags: ["owner-assistant"],
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      assignedUser: { select: { id: true, name: true, email: true } },
      additionalAssignees: {
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  const notes = text(args.notes, 4000);
  if (notes) await prisma.visitNote.create({ data: { visitId: visit.id, authorId: companyUser.id, body: notes } });
  await onVisitTimeChanged({ visitId: visit.id, companyId, isInitialSchedule: true }).catch((error) => {
    console.error("[owner-assistant] visit notification failed", visit.id, error);
  });
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  const { assignedUser, additionalAssignees, ...visitFields } = visit;
  return {
    ok: true,
    data: {
      visit: {
        ...visitFields,
        startAt: visit.startAt.toISOString(),
        endAt: visit.endAt.toISOString(),
        ...formatOwnerAssistantAppointment(visit.startAt, visit.endAt, company?.timezone),
        assignedEmployees: [
          ...(assignedUser ? [assignedUser] : []),
          ...additionalAssignees.map((assignment) => assignment.user),
        ],
      },
      customerNotificationAutomationMayRun: true,
    },
  };
}

export async function executeOwnerAssistantTool(ctx: Context, rawTool: string, rawArgs: unknown): Promise<Result> {
  if (!(OWNER_ASSISTANT_TOOL_NAMES as readonly string[]).includes(rawTool)) return invalid("Unknown or prohibited tool", "FORBIDDEN");
  const tool = rawTool as OwnerAssistantToolName;
  const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs as Record<string, unknown> : {};
  const started = Date.now();
  let result: Result;
  try {
    result = await execute(ctx, tool, args);
  } catch (error) {
    console.error("[owner-assistant] tool failed", tool, error);
    result = invalid("The CRM could not complete that action", "FAILED");
  }
  await prisma.ownerAssistantToolInvocation.create({
    data: {
      configId: ctx.configId,
      sessionId: ctx.sessionId || null,
      companyId: text(args.companyId, 128) || null,
      tool,
      argsHash: hashOwnerAssistantToolArgs(args),
      resultCode: result.ok ? "OK" : result.code || "FAILED",
      latencyMs: Date.now() - started,
      errorMessage: result.ok ? null : result.error?.slice(0, 500),
    },
  }).catch((error) => console.error("[owner-assistant] audit write failed", error));
  return result;
}
