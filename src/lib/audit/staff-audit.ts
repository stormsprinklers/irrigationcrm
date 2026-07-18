import { prisma } from "@/lib/prisma";

export type StaffAuditParams = {
  companyId: string;
  actorId: string;
  deviceId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  field?: string | null;
  before?: unknown;
  after?: unknown;
  customerId?: string | null;
  propertyId?: string | null;
  visitId?: string | null;
};

export async function writeStaffAuditLog(params: StaffAuditParams) {
  try {
    await prisma.staffAuditLog.create({
      data: {
        companyId: params.companyId,
        actorId: params.actorId,
        deviceId: params.deviceId ?? null,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        field: params.field ?? null,
        before: params.before === undefined ? undefined : (params.before as object),
        after: params.after === undefined ? undefined : (params.after as object),
        customerId: params.customerId ?? null,
        propertyId: params.propertyId ?? null,
        visitId: params.visitId ?? null,
      },
    });
  } catch (error) {
    console.error("[staff-audit] failed to write log", error);
  }
}
