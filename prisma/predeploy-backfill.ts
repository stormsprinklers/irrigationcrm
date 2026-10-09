/**
 * Backfills columns that Prisma cannot add as NOT NULL on non-empty tables
 * (@default(cuid()) is applied in the client, not in PostgreSQL).
 * Run before `prisma db push` on deploy.
 */
import { CampaignEnrollmentStatus, Channel, PrismaClient, Scope } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function backfillPublicToken(table: "Estimate" | "Invoice") {
  const exists = await columnExists(table, "publicToken");
  if (!exists) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "publicToken" TEXT`);
    console.log(`Added "${table}"."publicToken" column`);
  }

  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "publicToken" = "id" WHERE "publicToken" IS NULL`
  );
  console.log(`Backfilled "${table}"."publicToken" (${updated} rows)`);
}

async function backfillCallCustomers() {
  // Match orphaned call logs to customers by last-10 US digits (primary + alt phones).
  const primary = await prisma.$executeRawUnsafe(`
    UPDATE "CallLog" AS cl
    SET "customerId" = c.id
    FROM "Customer" AS c
    WHERE cl."customerId" IS NULL
      AND cl.scope = 'EXTERNAL'
      AND c."companyId" = cl."companyId"
      AND c.phone IS NOT NULL
      AND length(right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 10)) = 10
      AND right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 10) =
          right(
            regexp_replace(
              CASE WHEN cl.direction::text = 'INBOUND' THEN cl."fromNumber" ELSE cl."toNumber" END,
              '[^0-9]', '', 'g'
            ),
            10
          )
  `);
  const alt = await prisma.$executeRawUnsafe(`
    UPDATE "CallLog" AS cl
    SET "customerId" = cp."customerId"
    FROM "CustomerPhone" AS cp
    WHERE cl."customerId" IS NULL
      AND cl.scope = 'EXTERNAL'
      AND cp."companyId" = cl."companyId"
      AND length(right(regexp_replace(cp.phone, '[^0-9]', '', 'g'), 10)) = 10
      AND right(regexp_replace(cp.phone, '[^0-9]', '', 'g'), 10) =
          right(
            regexp_replace(
              CASE WHEN cl.direction::text = 'INBOUND' THEN cl."fromNumber" ELSE cl."toNumber" END,
              '[^0-9]', '', 'g'
            ),
            10
          )
  `);
  console.log(`Backfilled CallLog.customerId (primary=${primary}, alt=${alt})`);
}

async function ensureVehicleNotesColumn() {
  const exists = await columnExists("Vehicle", "notes");
  if (!exists) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Vehicle" ADD COLUMN "notes" TEXT`);
    console.log(`Added "Vehicle"."notes" column`);
  }
}

/**
 * Introduce the estimate deposit threshold and move companies that still use
 * the legacy untouched deposit defaults to the new 50%-over-$999 policy.
 * The settings are only changed when the threshold column is first added, so
 * later administrator edits are preserved on subsequent deploys.
 */
async function ensureEstimateDepositThresholds() {
  const companyHasThreshold = await columnExists("Company", "estimateDepositThreshold");
  if (!companyHasThreshold) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Company" ADD COLUMN "estimateDepositThreshold" DECIMAL(10,2) NOT NULL DEFAULT 999`
    );
    const updated = await prisma.$executeRawUnsafe(`
      UPDATE "Company"
      SET "estimateDepositRequired" = true,
          "estimateDepositType" = 'PERCENT'::"DepositType",
          "estimateDepositAmount" = 50
      WHERE "estimateDepositRequired" = false
        AND "estimateDepositType" IS NULL
        AND "estimateDepositAmount" IS NULL
    `);
    console.log(`Enabled default estimate deposits (${updated} companies)`);
  }

  if (!(await columnExists("Estimate", "depositThreshold"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Estimate" ADD COLUMN "depositThreshold" DECIMAL(10,2) NOT NULL DEFAULT 999`
    );
    console.log('Added "Estimate"."depositThreshold" column');
  }
}

async function isColumnNullable(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ is_nullable: string }[]>`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name = ${column}
  `;
  return rows[0]?.is_nullable === "YES";
}

/** If a prior deploy made these nullable, restore opted-in (false) as the default. */
async function restoreMarketingOptOutDefaults() {
  for (const column of ["marketingEmailOptOut", "marketingSmsOptOut"] as const) {
    const exists = await columnExists("Customer", column);
    if (!exists) continue;
    const alreadyNullable = await isColumnNullable("Customer", column);
    if (!alreadyNullable) continue;
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "Customer" SET "${column}" = false WHERE "${column}" IS NULL`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Customer" ALTER COLUMN "${column}" SET DEFAULT false`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Customer" ALTER COLUMN "${column}" SET NOT NULL`
    );
    console.log(`Restored Customer.${column} default opted-in (${updated} null rows)`);
  }
}

/** Existing Do Not Service records must carry explicit marketing opt-outs too. */
async function backfillDoNotServiceOptOuts() {
  if (!(await columnExists("Customer", "doNotService")) ||
      !(await columnExists("Customer", "marketingEmailOptOut")) ||
      !(await columnExists("Customer", "marketingSmsOptOut")) ||
      !(await columnExists("Customer", "appointmentReminderEmailOptOut")) ||
      !(await columnExists("Customer", "appointmentReminderSmsOptOut"))) return;
  const updated = await prisma.customer.updateMany({
    where: {
      doNotService: true,
      OR: [
        { marketingEmailOptOut: false }, { marketingSmsOptOut: false },
        { appointmentReminderEmailOptOut: false }, { appointmentReminderSmsOptOut: false },
      ],
    },
    data: {
      marketingEmailOptOut: true, marketingSmsOptOut: true,
      appointmentReminderEmailOptOut: true, appointmentReminderSmsOptOut: true,
    },
  });
  await prisma.campaignEnrollment.updateMany({
    where: { customer: { doNotService: true }, status: { in: [CampaignEnrollmentStatus.ACTIVE, CampaignEnrollmentStatus.PAUSED] } },
    data: { status: CampaignEnrollmentStatus.CANCELLED },
  });
  await prisma.campaignRecipient.updateMany({
    where: { customer: { doNotService: true }, status: "pending" },
    data: { status: "opt_out", error: "Do not service" },
  });
  console.log(`Backfilled Do Not Service marketing opt-outs (${updated.count} customers)`);
}

/** STOP is a marketing preference; undo the former behavior that also moved threads to Spam. */
async function removeLegacySmsStopBlocks() {
  if (!(await columnExists("BlockedContact", "reason"))) return;
  const removed = await prisma.blockedContact.deleteMany({
    where: { reason: "SMS STOP opt-out" },
  });
  console.log(`Removed legacy SMS STOP spam blocks (${removed.count} contacts)`);
}

/** Merge legacy duplicate customer SMS threads by company + last-10 phone digits. */
async function consolidateDuplicateCustomerSmsThreads() {
  const conversations = await prisma.conversation.findMany({
    where: {
      channel: Channel.SMS,
      scope: Scope.EXTERNAL,
      participantPhone: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      participantPhone: true,
      customerId: true,
      title: true,
      smsOpen: true,
      lastMessageAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof conversations>();
  for (const conversation of conversations) {
    const digits = (conversation.participantPhone ?? "").replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) continue;
    const key = `${conversation.companyId}:${digits}`;
    const group = groups.get(key) ?? [];
    group.push(conversation);
    groups.set(key, group);
  }

  let mergedCount = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const canonical = group[0];
    const duplicates = group.slice(1);
    const duplicateIds = duplicates.map((row) => row.id);
    const mostRecent = [...group].sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    );
    const smsOpen = group.some((row) => row.smsOpen === true)
      ? true
      : group.every((row) => row.smsOpen === false)
        ? false
        : null;
    const phoneDigits = key.slice(key.lastIndexOf(":") + 1);

    await prisma.$transaction(async (tx) => {
      await tx.message.updateMany({
        where: { conversationId: { in: duplicateIds } },
        data: { conversationId: canonical.id },
      });
      await tx.conversation.updateMany({
        where: { id: canonical.id },
        data: {
          participantPhone: `+1${phoneDigits}`,
          customerId: group.find((row) => row.customerId)?.customerId ?? null,
          title: mostRecent.find((row) => row.title?.trim())?.title ?? null,
          smsOpen,
          lastMessageAt: mostRecent[0].lastMessageAt,
        },
      });
      await tx.conversation.deleteMany({ where: { id: { in: duplicateIds } } });
    });
    mergedCount += duplicates.length;
  }

  console.log(`Merged duplicate customer SMS threads (${mergedCount} removed)`);
}

async function main() {
  await backfillPublicToken("Estimate");
  await backfillPublicToken("Invoice");
  try {
    await restoreMarketingOptOutDefaults();
  } catch (err) {
    console.warn("Marketing opt-out default restore skipped:", err);
  }
  await backfillDoNotServiceOptOuts();
  await removeLegacySmsStopBlocks();
  try {
    await consolidateDuplicateCustomerSmsThreads();
  } catch (err) {
    console.warn("SMS conversation consolidation skipped:", err);
  }
  try {
    await backfillCallCustomers();
  } catch (err) {
    console.warn("Call customer backfill skipped:", err);
  }
  try {
    await ensureVehicleNotesColumn();
  } catch (err) {
    console.warn("Vehicle notes column ensure skipped:", err);
  }
  try {
    await ensureEstimateDepositThresholds();
  } catch (err) {
    console.warn("Estimate deposit threshold ensure skipped:", err);
  }
}

main()
  .catch((err) => {
    console.error("predeploy-backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
