import { Division, VisitStatus } from "@prisma/client";
import { normalizePhone } from "@/lib/inbox/contacts";
import { onVisitTimeChanged } from "@/lib/notifications/visit-events";
import { prisma } from "@/lib/prisma";
import { runStormAiTool } from "@/lib/storm-ai/execute";
import { resolveOwnerCompanyUser, listOwnerAssistantCompanies } from "./access";
import { hashOwnerAssistantToolArgs } from "./auth";
import { OWNER_ASSISTANT_TOOL_NAMES, type OwnerAssistantToolName } from "./types";

type Context = { configId: string; ownerUserId: string; sessionId?: string | null };
type Result = { ok: boolean; data?: unknown; error?: string; code?: string };

const MUTATING = new Set<OwnerAssistantToolName>(["create_customer", "create_visit", "add_customer_note"]);

function invalid(error: string, code = "INVALID"): Result {
  return { ok: false, error, code };
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

  if (!MUTATING.has(tool)) {
    const { companyId: _companyId, ...toolArgs } = args;
    return runStormAiTool({
      id: companyUser.id,
      companyId,
      email: companyUser.email,
      name: companyUser.name,
      role: "ADMIN",
    }, tool, toolArgs);
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

  const customerId = text(args.customerId, 128);
  const title = text(args.title, 200);
  const startAt = new Date(String(args.startAt ?? ""));
  const endAt = new Date(String(args.endAt ?? ""));
  if (!customerId || !title || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return invalid("Valid customer, title, startAt, and endAt are required");
  }
  if (endAt.getTime() - startAt.getTime() > 24 * 60 * 60 * 1000) return invalid("A visit cannot exceed 24 hours");
  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true } });
  if (!customer) return invalid("Customer not found", "NOT_FOUND");
  const propertyId = text(args.propertyId, 128) || null;
  const property = propertyId
    ? await prisma.customerProperty.findFirst({ where: { id: propertyId, customerId, companyId } })
    : await prisma.customerProperty.findFirst({ where: { customerId, companyId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
  if (propertyId && !property) return invalid("Property not found", "NOT_FOUND");
  const assignedUserId = text(args.assignedUserId, 128) || null;
  if (assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedUserId, companyId, status: "ACTIVE" }, select: { id: true } });
    if (!assignee) return invalid("Assigned employee not found", "NOT_FOUND");
  }
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
      createdByUserId: companyUser.id,
      status: VisitStatus.SCHEDULED,
      address: property?.address,
      city: property?.city,
      state: property?.state,
      zip: property?.zip,
      tags: ["owner-assistant"],
    },
    select: { id: true, title: true, startAt: true, endAt: true },
  });
  const notes = text(args.notes, 4000);
  if (notes) await prisma.visitNote.create({ data: { visitId: visit.id, authorId: companyUser.id, body: notes } });
  await onVisitTimeChanged({ visitId: visit.id, companyId, isInitialSchedule: true }).catch((error) => {
    console.error("[owner-assistant] visit notification failed", visit.id, error);
  });
  return { ok: true, data: { visit: { ...visit, startAt: visit.startAt.toISOString(), endAt: visit.endAt.toISOString() }, customerNotificationAutomationMayRun: true } };
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
