import { HcpEntityType } from "@prisma/client";
import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import {
  FALLBACK_SERVICE_AREA_NAME,
  FALLBACK_SERVICE_AREA_SLUG,
} from "@/lib/housecall-pro/constants";
import { hcpId, hcpString, uniqueSlug } from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/price-book/queries";

export async function ensureFallbackServiceArea(companyId: string, migrationId: string) {
  const existing = await prisma.serviceArea.findFirst({
    where: { companyId, slug: FALLBACK_SERVICE_AREA_SLUG },
  });
  if (existing) {
    await upsertMapping({
      companyId,
      migrationId,
      entityType: HcpEntityType.SERVICE_ZONE,
      hcpId: "__fallback__",
      localId: existing.id,
    });
    return existing.id;
  }

  const area = await prisma.serviceArea.create({
    data: {
      companyId,
      name: FALLBACK_SERVICE_AREA_NAME,
      slug: FALLBACK_SERVICE_AREA_SLUG,
      color: "#6B7280",
      sortOrder: 9999,
    },
  });
  await upsertMapping({
    companyId,
    migrationId,
    entityType: HcpEntityType.SERVICE_ZONE,
    hcpId: "__fallback__",
    localId: area.id,
  });
  return area.id;
}

export async function resolveServiceAreaForMigration(
  companyId: string,
  migrationId: string,
  zoneId: string | null,
  zip: string | null
) {
  if (zoneId) {
    const mapped = await prisma.hcpEntityMapping.findUnique({
      where: {
        companyId_entityType_hcpId: {
          companyId,
          entityType: HcpEntityType.SERVICE_ZONE,
          hcpId: zoneId,
        },
      },
    });
    if (mapped) return mapped.localId;
  }

  if (zip) {
    const zipRow = await prisma.serviceAreaZip.findFirst({
      where: { zipCode: zip, serviceArea: { companyId } },
      select: { serviceAreaId: true },
    });
    if (zipRow) return zipRow.serviceAreaId;
  }

  const fallback = await prisma.hcpEntityMapping.findUnique({
    where: {
      companyId_entityType_hcpId: {
        companyId,
        entityType: HcpEntityType.SERVICE_ZONE,
        hcpId: "__fallback__",
      },
    },
  });
  if (fallback) return fallback.localId;

  return ensureFallbackServiceArea(companyId, migrationId);
}

export async function importServiceZonesBatch(ctx: ImportContext): Promise<BatchResult> {
  const result: BatchResult = {
    done: false,
    cursor: ctx.cursor,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  if (!ctx.cursor) {
    await ensureFallbackServiceArea(ctx.companyId, ctx.migrationId);
  }

  const page = await ctx.client.getPaginated("/service_zones", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["service_zones", "zones"],
  });

  if (page.totalEstimate != null && !ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step },
      data: { totalEstimate: page.totalEstimate },
    });
  }

  const existingSlugs = new Set(
    (
      await prisma.serviceArea.findMany({
        where: { companyId: ctx.companyId },
        select: { slug: true },
      })
    ).map((a) => a.slug)
  );

  for (const record of page.items) {
    result.processed++;
    const id = hcpId(record);
    const name = hcpString(record.name) ?? hcpString(record.title);
    if (!id || !name) {
      result.skipped++;
      continue;
    }

    try {
      const mapping = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.SERVICE_ZONE,
            hcpId: id,
          },
        },
      });

      const slug = uniqueSlug(name, existingSlugs);
      const zipCodes = Array.isArray(record.zip_codes)
        ? (record.zip_codes as unknown[]).map((z) => String(z).trim()).filter(Boolean)
        : Array.isArray(record.zips)
          ? (record.zips as unknown[]).map((z) => String(z).trim()).filter(Boolean)
          : [];

      if (mapping) {
        await prisma.serviceArea.update({
          where: { id: mapping.localId },
          data: {
            name,
            slug: slugify(name) || slug,
            color: hcpString(record.color) ?? hcpString(record.color_hex) ?? undefined,
          },
        });
        if (zipCodes.length) {
          await prisma.serviceAreaZip.deleteMany({ where: { serviceAreaId: mapping.localId } });
          await prisma.serviceAreaZip.createMany({
            data: zipCodes.map((zipCode) => ({
              serviceAreaId: mapping.localId,
              zipCode,
            })),
            skipDuplicates: true,
          });
        }
        result.updated++;
      } else {
        const area = await prisma.serviceArea.create({
          data: {
            companyId: ctx.companyId,
            name,
            slug,
            color: hcpString(record.color) ?? hcpString(record.color_hex) ?? "#2563EB",
            zips: zipCodes.length
              ? { create: zipCodes.map((zipCode) => ({ zipCode })) }
              : undefined,
          },
        });
        await upsertMapping({
          companyId: ctx.companyId,
          migrationId: ctx.migrationId,
          entityType: HcpEntityType.SERVICE_ZONE,
          hcpId: id,
          localId: area.id,
        });
        result.created++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Service zone import failed");
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
