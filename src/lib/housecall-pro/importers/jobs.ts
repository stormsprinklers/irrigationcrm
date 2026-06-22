import { Division, HcpEntityType } from "@prisma/client";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { resolveServiceAreaForMigration } from "@/lib/housecall-pro/importers/service-zones";
import { resolvePriceBookItemId } from "@/lib/housecall-pro/importers/services";
import {
  addressFromRecord,
  hcpDate,
  hcpId,
  hcpMoney,
  hcpString,
  hcpTags,
  lineItemsFromRecord,
  mapDivision,
  mapVisitStatus,
} from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

function jobSchedule(record: HcpRecord) {
  const schedule =
    record.schedule && typeof record.schedule === "object"
      ? (record.schedule as HcpRecord)
      : null;
  const start =
    hcpDate(record.scheduled_start) ??
    hcpDate(record.start_time) ??
    hcpDate(schedule?.scheduled_start);
  const end =
    hcpDate(record.scheduled_end) ??
    hcpDate(record.end_time) ??
    hcpDate(schedule?.scheduled_end);
  const fallbackStart = hcpDate(record.created_at) ?? new Date();
  const startAt = start ?? fallbackStart;
  const endAt = end ?? new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  return { startAt, endAt };
}

export async function importJobsBatch(ctx: ImportContext): Promise<BatchResult> {
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

  const defaultDivision = ctx.options.defaultDivision ?? Division.SERVICE;

  const page = await ctx.client.getPaginated("/jobs", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["jobs"],
  });

  if (page.totalEstimate != null && !ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step },
      data: { totalEstimate: page.totalEstimate },
    });
  }

  for (const record of page.items) {
    result.processed++;
    const id = hcpId(record);
    if (!id) {
      result.skipped++;
      continue;
    }

    try {
      const customerHcpId =
        hcpString(record.customer_id) ??
        hcpString((record.customer as HcpRecord | undefined)?.id);
      const customerMapping = customerHcpId
        ? await prisma.hcpEntityMapping.findUnique({
            where: {
              companyId_entityType_hcpId: {
                companyId: ctx.companyId,
                entityType: HcpEntityType.CUSTOMER,
                hcpId: customerHcpId,
              },
            },
          })
        : null;

      const addr = addressFromRecord(record);
      const zoneId =
        hcpString(record.service_zone_id) ??
        hcpString(record.zone_id) ??
        hcpString((record.service_zone as HcpRecord | undefined)?.id);
      const serviceAreaId = await resolveServiceAreaForMigration(
        ctx.companyId,
        ctx.migrationId,
        zoneId,
        addr.zip
      );

      const employeeHcpId =
        hcpString(record.assigned_employee_id) ??
        hcpString((record.assigned_employee as HcpRecord | undefined)?.id) ??
        hcpString((record.employees as HcpRecord[] | undefined)?.[0]?.id);
      const employeeMapping = employeeHcpId
        ? await prisma.hcpEntityMapping.findUnique({
            where: {
              companyId_entityType_hcpId: {
                companyId: ctx.companyId,
                entityType: HcpEntityType.EMPLOYEE,
                hcpId: employeeHcpId,
              },
            },
          })
        : null;

      const { startAt, endAt } = jobSchedule(record);
      const visitData = {
        companyId: ctx.companyId,
        customerId: customerMapping?.localId ?? null,
        title: hcpString(record.name) ?? hcpString(record.description) ?? `Job ${id}`,
        startAt,
        endAt,
        division: mapDivision(record.business_unit ?? record.division, defaultDivision),
        serviceAreaId,
        assignedUserId: employeeMapping?.localId ?? null,
        status: mapVisitStatus(record.work_status ?? record.status),
        tags: hcpTags(record),
        address: addr.address,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
      };

      const mapping = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.VISIT,
            hcpId: id,
          },
        },
      });

      let visitId: string;
      if (mapping) {
        await prisma.visit.update({
          where: { id: mapping.localId },
          data: visitData,
        });
        visitId = mapping.localId;
        await prisma.visitLineItem.deleteMany({ where: { visitId } });
        result.updated++;
      } else {
        const visit = await prisma.visit.create({ data: visitData });
        visitId = visit.id;
        await upsertMapping({
          companyId: ctx.companyId,
          migrationId: ctx.migrationId,
          entityType: HcpEntityType.VISIT,
          hcpId: id,
          localId: visitId,
        });
        result.created++;
      }

      const lineItems = lineItemsFromRecord(record);
      for (let i = 0; i < lineItems.length; i++) {
        const line = lineItems[i];
        const name = hcpString(line.name) ?? hcpString(line.description) ?? "Line item";
        const quantity = hcpMoney(line.quantity) || 1;
        const unitPrice = hcpMoney(line.unit_price ?? line.price ?? line.amount);
        const total = hcpMoney(line.total) || quantity * unitPrice;
        const priceBookItemId = await resolvePriceBookItemId(
          ctx.companyId,
          hcpString(line.service_item_id) ?? hcpString(line.pricebook_item_id),
          hcpString(line.material_id),
          name
        );
        await prisma.visitLineItem.create({
          data: {
            visitId,
            priceBookItemId,
            name,
            description: hcpString(line.description),
            quantity,
            unitPrice,
            total,
            sortOrder: i,
          },
        });
      }

      const notes = Array.isArray(record.notes) ? (record.notes as HcpRecord[]) : [];
      for (const note of notes) {
        const body = hcpString(note.content) ?? hcpString(note.body);
        if (!body) continue;
        const authorHcpId = hcpString(note.employee_id) ?? hcpString(note.author_id);
        const authorMapping = authorHcpId
          ? await prisma.hcpEntityMapping.findUnique({
              where: {
                companyId_entityType_hcpId: {
                  companyId: ctx.companyId,
                  entityType: HcpEntityType.EMPLOYEE,
                  hcpId: authorHcpId,
                },
              },
            })
          : null;
        await prisma.visitNote.create({
          data: {
            visitId,
            authorId: authorMapping?.localId ?? ctx.adminUserId,
            body,
            createdAt: hcpDate(note.created_at) ?? undefined,
          },
        });
      }
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Job import failed");
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
