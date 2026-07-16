/**
 * Backfills columns that Prisma cannot add as NOT NULL on non-empty tables
 * (@default(cuid()) is applied in the client, not in PostgreSQL).
 * Run before `prisma db push` on deploy.
 */
import { PrismaClient } from "@prisma/client";

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

async function main() {
  await backfillPublicToken("Estimate");
  await backfillPublicToken("Invoice");
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
}

main()
  .catch((err) => {
    console.error("predeploy-backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
