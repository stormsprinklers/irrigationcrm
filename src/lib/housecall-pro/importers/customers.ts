import { CustomerStatus, HcpEntityType } from "@prisma/client";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import {
  addressFromRecord,
  hcpDate,
  hcpId,
  hcpString,
  hcpTags,
} from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

function customerName(record: HcpRecord) {
  return (
    hcpString(record.name) ??
    [hcpString(record.first_name), hcpString(record.last_name)].filter(Boolean).join(" ") ??
    hcpString(record.company_name)
  );
}

function propertyRecords(record: HcpRecord): HcpRecord[] {
  if (Array.isArray(record.addresses)) return record.addresses as HcpRecord[];
  if (Array.isArray(record.properties)) return record.properties as HcpRecord[];
  const addr = addressFromRecord(record);
  if (addr.address || addr.city) {
    return [{ ...addr, id: record.id, name: "Primary" }];
  }
  return [];
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

  for (const record of page.items) {
    result.processed++;
    const id = hcpId(record);
    const name = customerName(record);
    if (!id || !name) {
      result.skipped++;
      continue;
    }

    try {
      const primary = addressFromRecord(record);
      const customerData = {
        name,
        email: hcpString(record.email),
        phone: hcpString(record.phone) ?? hcpString(record.mobile_number),
        companyName: hcpString(record.company_name),
        address: primary.address,
        city: primary.city,
        state: primary.state,
        zip: primary.zip,
        tags: hcpTags(record),
        status: record.archived === true ? CustomerStatus.ARCHIVED : CustomerStatus.ACTIVE,
        createdAt: hcpDate(record.created_at) ?? undefined,
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

      const properties = propertyRecords(record);
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
          name: hcpString(prop.name) ?? (i === 0 ? "Primary" : `Property ${i + 1}`),
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
