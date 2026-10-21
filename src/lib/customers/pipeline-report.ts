import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pipelineSpeedSeconds } from "@/lib/customers/pipeline";

export type PipelineSpeedFilter = "UNDER_5" | "FIVE_TO_30" | "OVER_30";

export type PipelineFilters = {
  search?: string;
  city?: string;
  zip?: string;
  createdFrom?: Date;
  createdTo?: Date;
  speed?: PipelineSpeedFilter;
};

export type PipelineRow = {
  id: string;
  name: string;
  city: string | null;
  zip: string | null;
  createdAt: Date;
  pipelineStage: string;
  pipelineLeadAt: Date;
  pipelineQualifiedAt: Date | null;
  pipelineConvertedAt: Date | null;
  pipelineSoldAt: Date | null;
  pipelineDisqualifiedAt: Date | null;
  pipelineLeadSource: string | null;
  pipelineFirstContactedAt: Date | null;
};

type MetricsRow = {
  leadCount: bigint;
  qualifiedCount: bigint;
  convertedCount: bigint;
  soldCount: bigint;
  averageSpeedSeconds: number | null;
};

function pipelineWhere(companyId: string, filters: PipelineFilters) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`c."companyId" = ${companyId}`,
    Prisma.sql`c."pipelineLeadAt" IS NOT NULL`,
  ];

  if (filters.search?.trim()) {
    conditions.push(Prisma.sql`c.name ILIKE ${`%${filters.search.trim()}%`}`);
  }
  if (filters.city?.trim()) {
    const value = `%${filters.city.trim()}%`;
    conditions.push(Prisma.sql`(
      c.city ILIKE ${value} OR EXISTS (
        SELECT 1 FROM "CustomerProperty" p
        WHERE p."customerId" = c.id AND p.city ILIKE ${value}
      )
    )`);
  }
  if (filters.zip?.trim()) {
    const value = `%${filters.zip.trim()}%`;
    conditions.push(Prisma.sql`(
      c.zip ILIKE ${value} OR EXISTS (
        SELECT 1 FROM "CustomerProperty" p
        WHERE p."customerId" = c.id AND p.zip ILIKE ${value}
      )
    )`);
  }
  if (filters.createdFrom) {
    conditions.push(Prisma.sql`c."createdAt" >= ${filters.createdFrom}`);
  }
  if (filters.createdTo) {
    conditions.push(Prisma.sql`c."createdAt" < ${filters.createdTo}`);
  }

  const speedSeconds = Prisma.sql`EXTRACT(EPOCH FROM (c."pipelineFirstContactedAt" - c."pipelineLeadAt"))`;
  if (filters.speed === "UNDER_5") {
    conditions.push(Prisma.sql`c."pipelineFirstContactedAt" IS NOT NULL AND ${speedSeconds} >= 0 AND ${speedSeconds} < 300`);
  } else if (filters.speed === "FIVE_TO_30") {
    conditions.push(Prisma.sql`c."pipelineFirstContactedAt" IS NOT NULL AND ${speedSeconds} >= 300 AND ${speedSeconds} <= 1800`);
  } else if (filters.speed === "OVER_30") {
    conditions.push(Prisma.sql`c."pipelineFirstContactedAt" IS NOT NULL AND ${speedSeconds} > 1800`);
  }

  return Prisma.join(conditions, " AND ");
}

const PIPELINE_SELECT = Prisma.sql`
  SELECT
    c.id,
    c.name,
    COALESCE(c.city, primary_property.city) AS city,
    COALESCE(c.zip, primary_property.zip) AS zip,
    c."createdAt",
    c."pipelineStage"::text AS "pipelineStage",
    c."pipelineLeadAt",
    c."pipelineQualifiedAt",
    c."pipelineConvertedAt",
    c."pipelineSoldAt",
    c."pipelineDisqualifiedAt",
    COALESCE(c."pipelineLeadSource", c."leadSource", c."attributionSource", c."attributionChannel") AS "pipelineLeadSource",
    c."pipelineFirstContactedAt"
  FROM "Customer" c
  LEFT JOIN LATERAL (
    SELECT p.city, p.zip
    FROM "CustomerProperty" p
    WHERE p."customerId" = c.id
    ORDER BY p."isPrimary" DESC, p."createdAt" ASC
    LIMIT 1
  ) primary_property ON true
`;

export async function querySalesPipeline(
  companyId: string,
  filters: PipelineFilters,
  options: { skip: number; take: number }
) {
  const where = pipelineWhere(companyId, filters);
  const [rows, metricsRows] = await Promise.all([
    prisma.$queryRaw<PipelineRow[]>(Prisma.sql`
      ${PIPELINE_SELECT}
      WHERE ${where}
      ORDER BY c."pipelineLeadAt" DESC, c.id ASC
      LIMIT ${options.take} OFFSET ${options.skip}
    `),
    prisma.$queryRaw<MetricsRow[]>(Prisma.sql`
      SELECT
        COUNT(*) AS "leadCount",
        COUNT(*) FILTER (WHERE c."pipelineQualifiedAt" IS NOT NULL) AS "qualifiedCount",
        COUNT(*) FILTER (WHERE c."pipelineConvertedAt" IS NOT NULL) AS "convertedCount",
        COUNT(*) FILTER (WHERE c."pipelineSoldAt" IS NOT NULL) AS "soldCount",
        AVG(EXTRACT(EPOCH FROM (c."pipelineFirstContactedAt" - c."pipelineLeadAt")))
          FILTER (WHERE c."pipelineFirstContactedAt" >= c."pipelineLeadAt") AS "averageSpeedSeconds"
      FROM "Customer" c
      WHERE ${where}
    `),
  ]);
  const raw = metricsRows[0];
  const metrics = {
    leadCount: Number(raw?.leadCount ?? 0),
    qualifiedCount: Number(raw?.qualifiedCount ?? 0),
    convertedCount: Number(raw?.convertedCount ?? 0),
    soldCount: Number(raw?.soldCount ?? 0),
    averageSpeedSeconds:
      raw?.averageSpeedSeconds == null ? null : Number(raw.averageSpeedSeconds),
  };
  return {
    rows: rows.map((row) => ({
      ...row,
      speedSeconds: pipelineSpeedSeconds(row),
    })),
    total: metrics.leadCount,
    metrics,
  };
}

export async function exportSalesPipeline(companyId: string, filters: PipelineFilters) {
  const where = pipelineWhere(companyId, filters);
  const rows = await prisma.$queryRaw<PipelineRow[]>(Prisma.sql`
    ${PIPELINE_SELECT}
    WHERE ${where}
    ORDER BY c."pipelineLeadAt" DESC, c.id ASC
  `);
  return rows.map((row) => ({ ...row, speedSeconds: pipelineSpeedSeconds(row) }));
}
