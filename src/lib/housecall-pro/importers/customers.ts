import { CustomerStatus, HcpEntityType } from "@prisma/client";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import {
  addressFromRecord,
  hcpAddressRecords,
  hcpCreatedAt,
  hcpCustomerCompanyName,
  hcpId,
  hcpString,
  hcpTags,
  primaryAddressFromHcpRecord,
  hasHcpAddressData,
} from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

function customerName(record: HcpRecord, id: string) {
  const fullName = [hcpString(record.first_name), hcpString(record.last_name)]
    .filter(Boolean)
    .join(" ");
  return (
    hcpString(record.name) ??
    (fullName || null) ??
    hcpString(record.display_name) ??
    hcpString(record.email) ??
    hcpString(record.phone) ??
    hcpString(record.mobile_number) ??
    `Customer ${id}`
  );
}

function propertyLabel(record: HcpRecord, index: number): string {
  const explicit = hcpString(record.name);
  if (explicit) return explicit;

  const type = hcpString(record.type)?.toLowerCase();
  if (type === "service") return "Service address";
  if (type === "billing") return "Billing address";
  return index === 0 ? "Primary" : `Property ${index + 1}`;
}

async function enrichCustomerRecord(
  ctx: ImportContext,
  record: HcpRecord,
  id: string
): Promise<HcpRecord> {
  const needsDetail = !hcpCreatedAt(record) || !hasHcpAddressData(record);
  if (!needsDetail) return record;

  try {
    const detail = await ctx.client.get<HcpRecord>(`/customers/${id}`);
    const customer = ((detail.customer as HcpRecord | undefined) ?? detail) as HcpRecord;
    return { ...record, ...customer };
  } catch {
    return record;
  }
}

export async function importCustomersBatch(ctx: ImportContext): Promise<BatchResult> {
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

  const page = await ctx.client.getPaginated("/customers", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["customers"],
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
    const record = await enrichCustomerRecord(ctx, listRecord, id);
    const name = customerName(record, id);

    try {
      const primary = primaryAddressFromHcpRecord(record);
      const importedCreatedAt = hcpCreatedAt(record);
      const customerData = {
        name,
        email: hcpString(record.email),
        phone: hcpString(record.phone) ?? hcpString(record.mobile_number),
        companyName: hcpCustomerCompanyName(record, name, ctx.options.excludeCompanyNames ?? []),
        address: primary?.address ?? null,
        city: primary?.city ?? null,
        state: primary?.state ?? null,
        zip: primary?.zip ?? null,
        tags: hcpTags(record),
        status: record.archived === true ? CustomerStatus.ARCHIVED : CustomerStatus.ACTIVE,
        ...(importedCreatedAt ? { createdAt: importedCreatedAt } : {}),
      };

      const mapping = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.CUSTOMER,
            hcpId: id,
          },
        },
      });

      let customerId: string;
      if (mapping) {
        await prisma.customer.update({
          where: { id: mapping.localId },
          data: customerData,
        });
        customerId = mapping.localId;
        result.updated++;
      } else {
        const customer = await prisma.customer.create({
          data: { companyId: ctx.companyId, ...customerData },
        });
        customerId = customer.id;
        await upsertMapping({
          companyId: ctx.companyId,
          migrationId: ctx.migrationId,
          entityType: HcpEntityType.CUSTOMER,
          hcpId: id,
          localId: customerId,
        });
        result.created++;
      }

      const phones = Array.isArray(record.phone_numbers)
        ? (record.phone_numbers as HcpRecord[])
        : [];
      if (customerData.phone) {
        phones.push({ phone: customerData.phone, note: "Primary" });
      }
      for (const phoneRecord of phones) {
        const phone = hcpString(phoneRecord.phone) ?? hcpString(phoneRecord.number);
        if (!phone) continue;
        const existingPhone = await prisma.customerPhone.findFirst({
          where: { customerId, phone },
        });
        if (!existingPhone) {
          await prisma.customerPhone.create({
            data: {
              companyId: ctx.companyId,
              customerId,
              phone,
              note: hcpString(phoneRecord.note),
            },
          });
        }
      }

      const properties = hcpAddressRecords(record);
      for (let i = 0; i < properties.length; i++) {
        const prop = properties[i];
        const propHcpId = hcpId(prop) || `${id}-property-${i}`;
        const propMapping = await prisma.hcpEntityMapping.findUnique({
          where: {
            companyId_entityType_hcpId: {
              companyId: ctx.companyId,
              entityType: HcpEntityType.PROPERTY,
              hcpId: propHcpId,
            },
          },
        });
        const addr = addressFromRecord(prop);
        const propertyData = {
          companyId: ctx.companyId,
          customerId,
          name: propertyLabel(prop, i),
          ...addr,
          isPrimary: i === 0,
        };

        if (propMapping) {
          await prisma.customerProperty.update({
            where: { id: propMapping.localId },
            data: propertyData,
          });
        } else {
          const property = await prisma.customerProperty.create({ data: propertyData });
          await upsertMapping({
            companyId: ctx.companyId,
            migrationId: ctx.migrationId,
            entityType: HcpEntityType.PROPERTY,
            hcpId: propHcpId,
            localId: property.id,
          });
        }
      }

    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Customer import failed");
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
