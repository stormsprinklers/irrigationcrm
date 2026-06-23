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

async function main() {
  await backfillPublicToken("Estimate");
  await backfillPublicToken("Invoice");
}

main()
  .catch((err) => {
    console.error("predeploy-backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
