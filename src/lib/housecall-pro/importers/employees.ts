import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { HcpEntityType } from "@prisma/client";
import type { BatchResult, ImportContext } from "@/lib/housecall-pro/types";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import {
  hcpId,
  hcpString,
  hcpTags,
  mapEmployeeRole,
  mapEmployeeStatus,
} from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

export async function importEmployeesBatch(ctx: ImportContext): Promise<BatchResult> {
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

  const page = await ctx.client.getPaginated("/employees", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["employees"],
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
    const name =
      hcpString(record.name) ??
      [hcpString(record.first_name), hcpString(record.last_name)].filter(Boolean).join(" ");
    const email = hcpString(record.email)?.toLowerCase();
    if (!id || !name || !email) {
      result.skipped++;
      continue;
    }

    try {
      const mapping = await prisma.hcpEntityMapping.findUnique({
        where: {
          companyId_entityType_hcpId: {
            companyId: ctx.companyId,
            entityType: HcpEntityType.EMPLOYEE,
            hcpId: id,
          },
        },
      });

      const userData = {
        name,
        phone: hcpString(record.phone) ?? hcpString(record.mobile_number),
        role: mapEmployeeRole(record.role),
        status: mapEmployeeStatus(record),
        tags: hcpTags(record),
        color: hcpString(record.color_hex) ?? "#2563EB",
      };

      if (mapping) {
        await prisma.user.update({
          where: { id: mapping.localId },
          data: userData,
        });
        result.updated++;
      } else {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
          if (existingUser.companyId !== ctx.companyId) {
            result.skipped++;
            result.errors.push(`Email ${email} belongs to another company`);
            continue;
          }
          await prisma.user.update({
            where: { id: existingUser.id },
            data: userData,
          });
          await upsertMapping({
            companyId: ctx.companyId,
            migrationId: ctx.migrationId,
            entityType: HcpEntityType.EMPLOYEE,
            hcpId: id,
            localId: existingUser.id,
          });
          result.updated++;
        } else {
          const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
          const user = await prisma.user.create({
            data: {
              companyId: ctx.companyId,
              email,
              passwordHash,
              ...userData,
            },
          });
          await upsertMapping({
            companyId: ctx.companyId,
            migrationId: ctx.migrationId,
            entityType: HcpEntityType.EMPLOYEE,
            hcpId: id,
            localId: user.id,
          });
          result.created++;
        }
      }
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : "Employee import failed");
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
