import type { HcpEntityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getLocalId(
  companyId: string,
  entityType: HcpEntityType,
  hcpId: string
) {
  const mapping = await prisma.hcpEntityMapping.findUnique({
    where: {
      companyId_entityType_hcpId: { companyId, entityType, hcpId },
    },
    select: { localId: true },
  });
  return mapping?.localId ?? null;
}

export async function upsertMapping(params: {
  companyId: string;
  migrationId: string;
  entityType: HcpEntityType;
  hcpId: string;
  localId: string;
  metadataJson?: Prisma.InputJsonValue;
}) {
  return prisma.hcpEntityMapping.upsert({
    where: {
      companyId_entityType_hcpId: {
        companyId: params.companyId,
        entityType: params.entityType,
        hcpId: params.hcpId,
      },
    },
    create: {
      companyId: params.companyId,
      migrationId: params.migrationId,
      entityType: params.entityType,
      hcpId: params.hcpId,
      localId: params.localId,
      metadataJson: params.metadataJson,
    },
    update: {
      localId: params.localId,
      migrationId: params.migrationId,
      metadataJson: params.metadataJson,
    },
  });
}

export async function listMappedParents(
  companyId: string,
  entityType: HcpEntityType,
  offset: number,
  take: number
) {
  return prisma.hcpEntityMapping.findMany({
    where: { companyId, entityType },
    orderBy: { createdAt: "asc" },
    skip: offset,
    take,
    select: { hcpId: true, localId: true },
  });
}

export async function countMappedParents(companyId: string, entityType: HcpEntityType) {
  return prisma.hcpEntityMapping.count({ where: { companyId, entityType } });
}
