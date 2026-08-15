import { HcpEntityType } from "@prisma/client";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import {
  debugLabelForRecord,
  emptyBatchResult,
  pushDebug,
  summarizeHcpRecord,
} from "@/lib/housecall-pro/debug";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import {
  FALLBACK_SERVICE_AREA_NAME,
  FALLBACK_SERVICE_AREA_SLUG,
} from "@/lib/housecall-pro/constants";
import { hcpId, hcpString, uniqueSlug } from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

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

  // Stale mapping may point at a deleted ServiceArea — replace it.
  const stale = await prisma.hcpEntityMapping.findUnique({
    where: {
      companyId_entityType_hcpId: {
        companyId,
        entityType: HcpEntityType.SERVICE_ZONE,
        hcpId: "__fallback__",
      },
    },
  });
  if (stale) {
    const stillThere = await prisma.serviceArea.findUnique({
      where: { id: stale.localId },
      select: { id: true },
    });
    if (stillThere) return stillThere.id;
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
    if (mapped) {
      const area = await prisma.serviceArea.findUnique({
        where: { id: mapped.localId },
        select: { id: true },
      });
      if (area) return area.id;
    }
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
  if (fallback) {
    const area = await prisma.serviceArea.findUnique({
      where: { id: fallback.localId },
      select: { id: true },
    });
    if (area) return area.id;
  }

  return ensureFallbackServiceArea(companyId, migrationId);
}

function zipCodesFromRecord(record: HcpRecord): string[] {
  if (Array.isArray(record.zip_codes)) {
    return (record.zip_codes as unknown[]).map((z) => String(z).trim()).filter(Boolean);
  }
  if (Array.isArray(record.zips)) {
    return (record.zips as unknown[]).map((z) => String(z).trim()).filter(Boolean);
  }
  return [];
}

async function syncZips(serviceAreaId: string, zipCodes: string[]) {
  if (!zipCodes.length) return;
  await prisma.serviceAreaZip.deleteMany({ where: { serviceAreaId } });
  await prisma.serviceAreaZip.createMany({
    data: zipCodes.map((zipCode) => ({ serviceAreaId, zipCode })),
    skipDuplicates: true,
  });
}

export async function importServiceZonesBatch(ctx: ImportContext): Promise<BatchResult> {
  const debugEnabled = Boolean(ctx.options.debugMode);
  const result = emptyBatchResult(ctx.cursor);

  if (!ctx.cursor) {
    await ensureFallbackServiceArea(ctx.companyId, ctx.migrationId);
  }

  const page = await ctx.client.getPaginated("/service_zones", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["service_zones", "zones"],
  });

  pushDebug(
    result,
    {
      action: "pulled",
      label: `HCP returned ${page.items.length} service zone(s)`,
      detail: {
        nextCursor: page.nextCursor,
        totalEstimate: page.totalEstimate ?? null,
        sample: page.items.slice(0, 3).map((r) => summarizeHcpRecord(r as HcpRecord)),
      },
    },
    { enabled: debugEnabled }
  );

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
      pushDebug(
        result,
        {
          action: "skipped",
          label: "Service zone missing id or name",
          detail: summarizeHcpRecord(record),
        },
        { enabled: debugEnabled }
      );
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

      const zipCodes = zipCodesFromRecord(record);
      const color =
        hcpString(record.color) ?? hcpString(record.color_hex) ?? undefined;

      const existingArea = mapping
        ? await prisma.serviceArea.findUnique({ where: { id: mapping.localId } })
        : null;

      if (mapping && existingArea) {
        await prisma.serviceArea.update({
          where: { id: existingArea.id },
          data: {
            name,
            // Keep the existing slug to avoid unique collisions on rename.
            color: color ?? existingArea.color,
          },
        });
        await syncZips(existingArea.id, zipCodes);
        result.updated++;
        pushDebug(
          result,
          {
            action: "updated",
            label: name,
            hcpId: id,
            detail: { name, zipCodes, color: color ?? existingArea.color },
          },
          { enabled: debugEnabled }
        );
        continue;
      }

      // No mapping, or mapping points at a deleted ServiceArea (stale after rollback).
      const slug = uniqueSlug(name, existingSlugs);
      existingSlugs.add(slug);
      const area = await prisma.serviceArea.create({
        data: {
          companyId: ctx.companyId,
          name,
          slug,
          color: color ?? "#2563EB",
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
      pushDebug(
        result,
        {
          action: "created",
          label: name,
          hcpId: id,
          detail: {
            name,
            slug,
            zipCodes,
            color: color ?? "#2563EB",
            recreatedFromStaleMapping: Boolean(mapping && !existingArea),
          },
        },
        { enabled: debugEnabled }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Service zone import failed";
      result.failed++;
      result.errors.push(message);
      pushDebug(
        result,
        {
          action: "failed",
          label: debugLabelForRecord(record, "Service zone"),
          hcpId: id,
          detail: summarizeHcpRecord(record),
          error: message,
        },
        { enabled: debugEnabled }
      );
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
