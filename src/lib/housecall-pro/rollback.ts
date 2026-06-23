import {
  HcpEntityType,
  HousecallProMigrationStatus,
  HousecallProMigrationStepStatus,
  HousecallProMigrationStepType,
  Prisma,
} from "@prisma/client";
import { MIGRATION_STEP_ORDER } from "@/lib/housecall-pro/constants";
import { prisma } from "@/lib/prisma";

const ROLLBACK_ENTITY_ORDER: HcpEntityType[] = [
  HcpEntityType.ATTACHMENT,
  HcpEntityType.INVOICE,
  HcpEntityType.ESTIMATE,
  HcpEntityType.VISIT,
  HcpEntityType.PROPERTY,
  HcpEntityType.CUSTOMER,
  HcpEntityType.MATERIAL,
  HcpEntityType.SERVICE,
  HcpEntityType.MATERIAL_CATEGORY,
  HcpEntityType.SERVICE_ZONE,
  HcpEntityType.EMPLOYEE,
  HcpEntityType.TAG,
];

export type RollbackSummary = {
  migrationId: string;
  deleted: Record<string, number>;
  errors: string[];
};

async function deleteAttachmentMapping(companyId: string, blobUrl: string) {
  await prisma.customerAttachment.deleteMany({
    where: { customer: { companyId }, blobUrl },
  });
  await prisma.visitAttachment.deleteMany({
    where: { visit: { companyId }, blobUrl },
  });
  await prisma.estimateAttachment.deleteMany({
    where: { estimate: { companyId }, blobUrl },
  });
}

async function deleteMappedEntity(
  companyId: string,
  entityType: HcpEntityType,
  localId: string
): Promise<boolean> {
  switch (entityType) {
    case HcpEntityType.ATTACHMENT:
      await deleteAttachmentMapping(companyId, localId);
      return true;
    case HcpEntityType.INVOICE:
      await prisma.invoice.deleteMany({ where: { id: localId, companyId } });
      return true;
    case HcpEntityType.ESTIMATE:
      await prisma.estimate.deleteMany({ where: { id: localId, companyId } });
      return true;
    case HcpEntityType.VISIT:
      await prisma.visit.deleteMany({ where: { id: localId, companyId } });
      return true;
    case HcpEntityType.PROPERTY:
      await prisma.customerProperty.deleteMany({ where: { id: localId, companyId } });
      return true;
    case HcpEntityType.CUSTOMER:
      await prisma.customer.deleteMany({ where: { id: localId, companyId } });
      return true;
    case HcpEntityType.MATERIAL:
    case HcpEntityType.SERVICE:
      await prisma.priceBookItem.deleteMany({ where: { id: localId, category: { companyId } } });
      return true;
    case HcpEntityType.MATERIAL_CATEGORY:
      await prisma.priceBookCategory.deleteMany({ where: { id: localId, companyId } });
      return true;
    case HcpEntityType.SERVICE_ZONE:
      await prisma.serviceArea.deleteMany({ where: { id: localId, companyId } });
      return true;
    case HcpEntityType.EMPLOYEE:
      await prisma.user.deleteMany({ where: { id: localId, companyId } });
      return true;
    case HcpEntityType.TAG:
      return true;
    default:
      return false;
  }
}

/**
 * Deletes all records tracked by HCP entity mappings for a migration (or entire company if no migrationId).
 * Resets migration progress so import can start fresh.
 */
export async function rollbackHousecallProMigration(
  companyId: string,
  migrationId?: string
): Promise<RollbackSummary> {
  const migration = migrationId
    ? await prisma.housecallProMigration.findFirst({
        where: { id: migrationId, companyId },
      })
    : await prisma.housecallProMigration.findFirst({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });

  if (!migration) {
    throw new Error("No migration found to roll back");
  }

  const where: Prisma.HcpEntityMappingWhereInput = { companyId };
  if (migrationId) {
    where.migrationId = migrationId;
  }

  const mappings = await prisma.hcpEntityMapping.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const deleted: Record<string, number> = {};
  const errors: string[] = [];
  const deletedLocalIds = new Set<string>();

  for (const entityType of ROLLBACK_ENTITY_ORDER) {
    const typeMappings = mappings.filter((m) => m.entityType === entityType);
    for (const mapping of typeMappings) {
      const dedupeKey = `${entityType}:${mapping.localId}`;
      if (deletedLocalIds.has(dedupeKey)) continue;

      try {
        await deleteMappedEntity(companyId, entityType, mapping.localId);
        deleted[entityType] = (deleted[entityType] ?? 0) + 1;
        deletedLocalIds.add(dedupeKey);
      } catch (err) {
        errors.push(
          `${entityType} ${mapping.localId}: ${err instanceof Error ? err.message : "delete failed"}`
        );
      }
    }
  }

  await prisma.hcpEntityMapping.deleteMany({ where });

  await prisma.housecallProMigrationStep.updateMany({
    where: { migrationId: migration.id },
    data: {
      status: HousecallProMigrationStepStatus.PENDING,
      cursor: null,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      lastError: null,
      statsJson: Prisma.DbNull,
      startedAt: null,
      completedAt: null,
      totalEstimate: null,
    },
  });

  await prisma.housecallProMigration.update({
    where: { id: migration.id },
    data: {
      status: HousecallProMigrationStatus.DRAFT,
      currentStep: HousecallProMigrationStepType.CONNECT,
      startedAt: null,
      completedAt: null,
      pausedAt: null,
    },
  });

  return { migrationId: migration.id, deleted, errors };
}
