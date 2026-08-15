import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { HcpEntityType } from "@prisma/client";
import type { BatchResult, ImportContext, HcpRecord } from "@/lib/housecall-pro/types";
import {
  emptyBatchResult,
  pushDebug,
  pushEntityDebug,
} from "@/lib/housecall-pro/debug";
import { upsertMapping } from "@/lib/housecall-pro/mapping";
import { formatEmployeeName, resolveEmployeeDivision, splitFullName } from "@/lib/employees";
import {
  hcpId,
  hcpString,
  hcpTags,
  mapEmployeeRole,
  mapEmployeeStatus,
} from "@/lib/housecall-pro/utils";
import { prisma } from "@/lib/prisma";

export async function importEmployeesBatch(ctx: ImportContext): Promise<BatchResult> {
  const debugEnabled = Boolean(ctx.options.debugMode);
  const result = emptyBatchResult(ctx.cursor);

  const page = await ctx.client.getPaginated("/employees", {
    cursor: ctx.cursor,
    pageSize: ctx.batchSize,
    arrayKeys: ["employees"],
  });

  pushDebug(
    result,
    {
      action: "pulled",
      label: `HCP returned ${page.items.length} employee(s)`,
      detail: { nextCursor: page.nextCursor, totalEstimate: page.totalEstimate ?? null },
    },
    { enabled: debugEnabled }
  );

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
      pushEntityDebug(result, {
        enabled: debugEnabled,
        action: "skipped",
        kind: "Employee",
        record,
        fields: { reason: "Missing id, name, or email", name, email },
      });
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

      const role = mapEmployeeRole(record.role);
      const firstName =
        hcpString(record.first_name) ?? splitFullName(name).firstName;
      const lastName =
        hcpString(record.last_name) ?? splitFullName(name).lastName;
      const phone = hcpString(record.phone) ?? hcpString(record.mobile_number);
      const tags = hcpTags(record);
      const userData = {
        firstName,
        lastName,
        name: formatEmployeeName(firstName, lastName),
        phone,
        role,
        division: resolveEmployeeDivision(role, null),
        status: mapEmployeeStatus(record),
        tags,
        color: hcpString(record.color_hex) ?? "#2563EB",
      };

      const fields = {
        name: userData.name,
        email,
        phone,
        role: String(role),
        division: String(userData.division),
        status: String(userData.status),
        tags,
      };

      if (mapping) {
        await prisma.user.update({
          where: { id: mapping.localId },
          data: userData,
        });
        result.updated++;
        pushEntityDebug(result, {
          enabled: debugEnabled,
          action: "updated",
          kind: "Employee",
          record,
          fields: { ...fields, localId: mapping.localId },
        });
      } else {
        const existingUser = await prisma.user.findFirst({
          where: { companyId: ctx.companyId, email },
        });
        if (existingUser) {
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
          pushEntityDebug(result, {
            enabled: debugEnabled,
            action: "updated",
            kind: "Employee",
            record,
            fields: { ...fields, localId: existingUser.id, matchedBy: "email" },
          });
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
          pushEntityDebug(result, {
            enabled: debugEnabled,
            action: "created",
            kind: "Employee",
            record,
            fields: { ...fields, localId: user.id },
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Employee import failed";
      result.failed++;
      result.errors.push(message);
      pushEntityDebug(result, {
        enabled: debugEnabled,
        action: "failed",
        kind: "Employee",
        record,
        fields: { name, email },
        error: message,
      });
    }
  }

  result.cursor = page.nextCursor;
  result.done = !page.nextCursor;
  return result;
}
