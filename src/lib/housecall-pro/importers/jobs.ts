import { Division, HcpEntityType } from "@prisma/client";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import {
  HCP_JOB_LINE_ITEMS_PATHS,
  HCP_PARENT_DETAIL_PATHS,
} from "@/lib/housecall-pro/constants";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { resolveServiceAreaForMigration } from "@/lib/housecall-pro/importers/service-zones";
import { resolvePriceBookItemId } from "@/lib/housecall-pro/importers/services";
import {
  addressFromRecord,
  hcpDate,
  hcpId,
  hcpMoney,
  hcpQuantity,
  hcpString,
  hcpTags,
  lineItemsFromRecord,
  mapDivision,
  mapVisitStatus,
} from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

function hcpCustomerDisplayName(customer: HcpRecord | undefined | null): string | null {
  if (!customer) return null;
  const fullName = [hcpString(customer.first_name), hcpString(customer.last_name)]
    .filter(Boolean)
    .join(" ");
  return (
    hcpString(customer.name) ??
    (fullName || null) ??
    hcpString(customer.display_name)
  );
}

function isInternalHcpLabel(value: string): boolean {
  if (/^job[_-][a-z0-9]+$/i.test(value)) return true;
  return value.length >= 20 && /^[a-z0-9_-]+$/i.test(value) && !value.includes(" ");
}

function visitTitleFromHcpJob(record: HcpRecord, customerName: string | null): string {
  const jobNumber =
    hcpString(record.invoice_number) ??
    hcpString(record.job_number) ??
    hcpString(record.work_order_number) ??
    hcpString(record.number);
  if (jobNumber) {
    return `Visit #${jobNumber.replace(/^#/, "")}`;
  }

  const name = hcpString(record.name);
  const description = hcpString(record.description);
  if (name && !isInternalHcpLabel(name)) return name;
  if (description && !isInternalHcpLabel(description)) return description;

  return customerName ? `Visit for ${customerName}` : "Visit for Unknown customer";
}

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

async function enrichJobRecord(
  ctx: ImportContext,
  record: HcpRecord,
  id: string
): Promise<HcpRecord> {
  if (lineItemsFromRecord(record).length) return record;

  let merged = { ...record };
  for (const path of HCP_PARENT_DETAIL_PATHS.jobs(id)) {
    try {
      const detail = await ctx.client.get<HcpRecord>(path);
      const job = ((detail.job as HcpRecord | undefined) ?? detail) as HcpRecord;
      merged = { ...merged, ...job };
      if (lineItemsFromRecord(merged).length) return merged;
    } catch {
      // try next path
    }
  }

  for (const path of HCP_JOB_LINE_ITEMS_PATHS(id)) {
    try {
      const data = await ctx.client.get<HcpRecord>(path);
      const items = lineItemsFromRecord(data);
      if (items.length) {
        return { ...merged, line_items: items };
      }
    } catch {
      // try next path
    }
  }

  return merged;
}

function jobLineItems(record: HcpRecord): HcpRecord[] {
  const items = lineItemsFromRecord(record);
  if (items.length) return items;

  const totalCents =
    record.total_amount ?? record.total ?? record.amount ?? record.subtotal;
  if (totalCents != null && totalCents !== "" && totalCents !== 0) {
    return [
      {
        name: "Imported visit total",
        quantity: 1,
        unit_price: totalCents,
        total: totalCents,
      },
    ];
  }
  return [];
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

  for (const listRecord of page.items) {
    result.processed++;
    const id = hcpId(listRecord);
    if (!id) {
      result.skipped++;
      continue;
    }

    try {
      const record = await enrichJobRecord(ctx, listRecord, id);
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

      const localCustomer = customerMapping
        ? await prisma.customer.findUnique({
            where: { id: customerMapping.localId },
            select: { name: true },
          })
        : null;
      const customerName =
        hcpCustomerDisplayName(record.customer as HcpRecord | undefined) ??
        localCustomer?.name ??
        null;

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
        title: visitTitleFromHcpJob(record, customerName),
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

      const lineItems = jobLineItems(record);
      for (let i = 0; i < lineItems.length; i++) {
        const line = lineItems[i];
        const name = hcpString(line.name) ?? hcpString(line.description) ?? "Line item";
        const quantity = hcpQuantity(line.quantity) || 1;
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
      result.errors.push(err instanceof Error ? err.message : "Visit import failed");
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
