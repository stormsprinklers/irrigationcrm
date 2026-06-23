import { HcpEntityType, InvoiceStatus, PaymentMethod } from "@prisma/client";
import { HCP_PATHS } from "@/lib/housecall-pro/constants";
import { hcpRelatedId } from "@/lib/housecall-pro/expand";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import {
  hcpDate,
  hcpId,
  hcpMoney,
  hcpQuantity,
  hcpString,
  lineItemsFromRecord,
  mapInvoiceStatus,
} from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

function paymentMethodFromHcp(value: unknown): PaymentMethod {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("cash")) return PaymentMethod.CASH;
  if (text.includes("check")) return PaymentMethod.CHECK;
  if (text.includes("card") || text.includes("stripe")) return PaymentMethod.STRIPE;
  return PaymentMethod.OTHER;
}

async function importSingleInvoice(
  ctx: ImportContext,
  record: HcpRecord,
  result: BatchResult
) {
  const id = hcpId(record);
  if (!id) {
    result.skipped++;
    return;
  }

  const customerHcpId = hcpRelatedId(
    record,
    "customer_id",
    "customer_uuid",
    "customer"
  );
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
  let customerLocalId = customerMapping?.localId ?? null;

  const jobHcpId = hcpRelatedId(record, "job_id", "job_uuid", "work_order_id", "job");
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

  if (!customerLocalId && visitMapping) {
    const visit = await prisma.visit.findUnique({
      where: { id: visitMapping.localId },
      select: { customerId: true },
    });
    customerLocalId = visit?.customerId ?? null;
  }

  if (!customerLocalId) {
    result.skipped++;
    return;
  }

  const estimateHcpId = hcpRelatedId(record, "estimate_id", "estimate_uuid", "estimate");
  const estimateMapping = estimateHcpId
    ? await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.ESTIMATE,
            hcpId: estimateHcpId,
          },
        },
      })
    : null;

  const lineItems = lineItemsFromRecord(record);
  let subtotal = 0;
  for (const line of lineItems) {
    subtotal += hcpMoney(line.total) || hcpMoney(line.amount) || 0;
  }
  const tax = hcpMoney(record.tax);
  const total = hcpMoney(record.total) || subtotal + tax;
  const status = mapInvoiceStatus(record);

  let invoiceNumber =
    hcpString(record.invoice_number) ??
    hcpString(record.number) ??
    `HCP-${id.slice(0, 8)}`;

  const mapping = await prisma.hcpEntityMapping.findUnique({
    where: {
      companyId_entityType_hcpId: {
        companyId: ctx.companyId,
        entityType: HcpEntityType.INVOICE,
        hcpId: id,
      },
    },
  });

  const invoiceData = {
    companyId: ctx.companyId,
    customerId: customerLocalId,
    visitId: visitMapping?.localId ?? null,
    estimateId: estimateMapping?.localId ?? null,
    invoiceNumber,
    status,
    subtotal,
    tax,
    total,
    paidAt: status === InvoiceStatus.PAID ? hcpDate(record.paid_at) ?? hcpDate(record.updated_at) : null,
    sentAt: hcpDate(record.sent_at),
    createdAt: hcpDate(record.created_at) ?? undefined,
  };

  let invoiceId: string;
  if (mapping) {
    await prisma.invoice.update({
      where: { id: mapping.localId },
      data: invoiceData,
    });
    invoiceId = mapping.localId;
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId } });
    await prisma.payment.deleteMany({ where: { invoiceId } });
    result.updated++;
  } else {
    const existingNumber = await prisma.invoice.findFirst({
      where: { companyId: ctx.companyId, invoiceNumber },
    });
    if (existingNumber) {
      invoiceNumber = `${invoiceNumber}-${id.slice(0, 6)}`;
    }
    const invoice = await prisma.invoice.create({
      data: { ...invoiceData, invoiceNumber },
    });
    invoiceId = invoice.id;
    await upsertMapping({
      companyId: ctx.companyId,
      migrationId: ctx.migrationId,
      entityType: HcpEntityType.INVOICE,
      hcpId: id,
      localId: invoiceId,
    });
    result.created++;
  }

  for (let i = 0; i < lineItems.length; i++) {
    const line = lineItems[i];
    const name = hcpString(line.name) ?? hcpString(line.description) ?? "Line item";
    const quantity = hcpQuantity(line.quantity) || 1;
    const unitPrice = hcpMoney(line.unit_price ?? line.price ?? line.amount);
    const lineTotal = hcpMoney(line.total) || quantity * unitPrice;
    await prisma.invoiceLineItem.create({
      data: {
        invoiceId,
        name,
        description: hcpString(line.description),
        quantity,
        unitPrice,
        total: lineTotal,
        sortOrder: i,
      },
    });
  }

  const payments = Array.isArray(record.payments) ? (record.payments as HcpRecord[]) : [];
  if (payments.length) {
    for (const payment of payments) {
      await prisma.payment.create({
        data: {
          invoiceId,
          amount: hcpMoney(payment.amount),
          method: paymentMethodFromHcp(payment.payment_method ?? payment.method),
          paidAt: hcpDate(payment.paid_at) ?? hcpDate(payment.created_at) ?? new Date(),
        },
      });
    }
  } else if (status === InvoiceStatus.PAID && total > 0) {
    await prisma.payment.create({
      data: {
        invoiceId,
        amount: total,
        method: paymentMethodFromHcp(record.payment_method),
        paidAt: hcpDate(record.paid_at) ?? new Date(),
      },
    });
  }
}

export async function importInvoicesBatch(ctx: ImportContext): Promise<BatchResult> {
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

  const cursorParts = (ctx.cursor ?? "invoices:1").split(":");
  const source = cursorParts[0] === "job_invoices" ? "job_invoices" : "invoices";
  const pageCursor = cursorParts[1] ?? "1";

  const path = source === "job_invoices" ? "/job_invoices" : "/invoices";
  const arrayKeys = source === "job_invoices" ? ["job_invoices", "invoices"] : ["invoices"];

  const page = await ctx.client.getPaginatedFirst(HCP_PATHS.invoices, {
    cursor: pageCursor === "1" && cursorParts.length === 1 ? ctx.cursor : pageCursor,
    pageSize: ctx.batchSize,
    arrayKeys,
    params: { "expand[]": "customer" },
  });

  if (page.totalEstimate != null && !ctx.cursor) {
    await prisma.housecallProMigrationStep.updateMany({
      where: { migrationId: ctx.migrationId, step: ctx.step },
      data: { totalEstimate: page.totalEstimate },
    });
  }

  for (const record of page.items) {
    result.processed++;
    try {
      await importSingleInvoice(ctx, record, result);
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Invoice import failed");
    }
  }

  if (page.nextCursor) {
    result.cursor = `${source}:${page.nextCursor}`;
    result.done = false;
  } else if (source === "invoices") {
    result.cursor = "job_invoices:1";
    result.done = false;
  } else {
    result.cursor = null;
    result.done = true;
  }

  return result;
}
