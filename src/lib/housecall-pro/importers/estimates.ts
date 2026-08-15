import { EstimateStatus, HcpEntityType } from "@prisma/client";
import {
  emptyBatchResult,
  pushEntityDebug,
} from "@/lib/housecall-pro/debug";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { resolvePriceBookItemId } from "@/lib/housecall-pro/importers/services";
import {
  hcpDate,
  hcpId,
  hcpMoney,
  hcpQuantity,
  hcpString,
  lineItemsFromRecord,
  mapEstimateStatus,
  pickEstimateOption,
} from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

export async function importEstimatesBatch(ctx: ImportContext): Promise<BatchResult> {
  const debugEnabled = Boolean(ctx.options.debugMode);
  const result = emptyBatchResult(ctx.cursor);

  const page = await ctx.client.getPaginated("/estimates", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["estimates"],
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
      pushEntityDebug(result, {
        enabled: debugEnabled,
        action: "skipped",
        kind: "Estimate",
        record,
        fields: { reason: "Missing id" },
      });
      continue;
    }

    try {
      const estimateNumber =
        hcpString(record.estimate_number) ?? hcpString(record.number) ?? id;
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
      if (!customerMapping) {
        result.skipped++;
        pushEntityDebug(result, {
          enabled: debugEnabled,
          action: "skipped",
          kind: "Estimate",
          record,
          fields: {
            estimateNumber,
            reason: "Customer not mapped",
            customerHcpId: customerHcpId ?? null,
          },
        });
        continue;
      }

      const jobHcpId = hcpString(record.job_id) ?? hcpString(record.work_order_id);
      const visitMapping = jobHcpId
        ? await prisma.hcpEntityMapping.findUnique({
            where: {
              companyId_entityType_hcpId: {
                companyId: ctx.companyId,
                entityType: HcpEntityType.VISIT,
                hcpId: jobHcpId,
              },
            },
          })
        : null;

      const option = pickEstimateOption(record);
      const lineSource = option ?? record;
      const lineItems = lineItemsFromRecord(lineSource);
      let subtotal = 0;
      for (const line of lineItems) {
        subtotal += hcpMoney(line.total) || hcpMoney(line.amount) || 0;
      }
      if (!subtotal) subtotal = hcpMoney(option?.total_amount ?? record.total_amount);

      const estimateStatus = mapEstimateStatus(record, Boolean(visitMapping));
      const debugFields = {
        estimateNumber,
        status: estimateStatus,
        customerHcpId: customerHcpId ?? null,
        customerId: customerMapping.localId,
        total: subtotal,
      };

      const estimateData = {
        companyId: ctx.companyId,
        customerId: customerMapping.localId,
        visitId: visitMapping?.localId ?? null,
        status: estimateStatus,
        subtotal,
        total: subtotal,
        approvedAt:
          estimateStatus === EstimateStatus.APPROVED ||
          estimateStatus === EstimateStatus.CONVERTED
            ? hcpDate(record.updated_at) ?? new Date()
            : null,
        createdAt: hcpDate(record.created_at) ?? undefined,
      };

      const mapping = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.ESTIMATE,
            hcpId: id,
          },
        },
      });

      let estimateId: string;
      if (mapping) {
        await prisma.estimate.update({
          where: { id: mapping.localId },
          data: estimateData,
        });
        estimateId = mapping.localId;
        await prisma.estimateLineItem.deleteMany({ where: { estimateId } });
        result.updated++;
        pushEntityDebug(result, {
          enabled: debugEnabled,
          action: "updated",
          kind: "Estimate",
          record,
          fields: debugFields,
        });
      } else {
        const estimate = await prisma.estimate.create({ data: estimateData });
        estimateId = estimate.id;
        await upsertMapping({
          companyId: ctx.companyId,
          migrationId: ctx.migrationId,
          entityType: HcpEntityType.ESTIMATE,
          hcpId: id,
          localId: estimateId,
        });
        result.created++;
        pushEntityDebug(result, {
          enabled: debugEnabled,
          action: "created",
          kind: "Estimate",
          record,
          fields: debugFields,
        });
      }

      for (let i = 0; i < lineItems.length; i++) {
        const line = lineItems[i];
        const name = hcpString(line.name) ?? hcpString(line.description) ?? "Line item";
        const quantity = hcpQuantity(line.quantity) || 1;
        const unitPrice = hcpMoney(line.unit_price ?? line.price ?? line.amount);
        const total = hcpMoney(line.total) || quantity * unitPrice;
        const priceBookItemId = await resolvePriceBookItemId(
          ctx.companyId,
          hcpString(line.service_item_id),
          hcpString(line.material_id),
          name
        );
        await prisma.estimateLineItem.create({
          data: {
            estimateId,
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
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : "Estimate import failed";
      result.errors.push(message);
      pushEntityDebug(result, {
        enabled: debugEnabled,
        action: "failed",
        kind: "Estimate",
        record,
        fields: {
          estimateNumber:
            hcpString(record.estimate_number) ?? hcpString(record.number) ?? hcpId(record),
        },
        error: message,
      });
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
