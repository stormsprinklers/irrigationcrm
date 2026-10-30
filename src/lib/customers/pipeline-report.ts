import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pipelineSpeedSeconds } from "@/lib/customers/pipeline";

export type PipelineSpeedFilter = "UNDER_5" | "FIVE_TO_30" | "OVER_30";
export type PipelineFilters = { search?: string; city?: string; zip?: string; source?: string; createdFrom?: Date; createdTo?: Date; speed?: PipelineSpeedFilter };
export type PipelineScope = { affiliateUserId?: string };
export type PipelineFollowUpRow = { id: string; stage: string; sequence: number; method: string; status: string; automated: boolean; completedAt: string | null; smsSentAt: string | null; emailSentAt: string | null };
export type PipelineRow = {
  id: string; name: string; phone: string | null; email: string | null; city: string | null; zip: string | null; createdAt: Date;
  pipelineStage: string; pipelineLeadAt: Date; pipelineQualifiedAt: Date | null; pipelineConvertedAt: Date | null;
  pipelineSoldAt: Date | null; pipelineDisqualifiedAt: Date | null; pipelineLeadSource: string | null;
  pipelineFirstContactedAt: Date | null; pipelineDeclinedAt: Date | null; pipelineDeclineReason: string | null;
  pipelineFollowUpsPausedAt: Date | null; qualifiedValue: number | null; convertedValue: number | null; soldValue: number | null;
  followUps: PipelineFollowUpRow[];
};
type MetricsRow = { leadCount: bigint; qualifiedCount: bigint; convertedCount: bigint; soldCount: bigint; averageSpeedSeconds: number | null; qualifiedTotal: number | null; convertedTotal: number | null; soldTotal: number | null };

function pipelineWhere(companyId: string, filters: PipelineFilters, scope: PipelineScope = {}) {
  const conditions: Prisma.Sql[] = [Prisma.sql`c."companyId" = ${companyId}`, Prisma.sql`c."givingProgramOnly" = false`, Prisma.sql`c."pipelineLeadAt" IS NOT NULL`, Prisma.sql`c."pipelineRemovedAt" IS NULL`];
  if (scope.affiliateUserId) conditions.push(Prisma.sql`c."affiliateUserId" = ${scope.affiliateUserId}`);
  if (filters.search?.trim()) conditions.push(Prisma.sql`c.name ILIKE ${`%${filters.search.trim()}%`}`);
  if (filters.city?.trim()) { const value = `%${filters.city.trim()}%`; conditions.push(Prisma.sql`(c.city ILIKE ${value} OR EXISTS (SELECT 1 FROM "CustomerProperty" p WHERE p."customerId" = c.id AND p.city ILIKE ${value}))`); }
  if (filters.zip?.trim()) { const value = `%${filters.zip.trim()}%`; conditions.push(Prisma.sql`(c.zip ILIKE ${value} OR EXISTS (SELECT 1 FROM "CustomerProperty" p WHERE p."customerId" = c.id AND p.zip ILIKE ${value}))`); }
  if (filters.source?.trim()) conditions.push(Prisma.sql`COALESCE(c."pipelineLeadSource", c."leadSource", c."attributionSource", c."attributionChannel", 'Unknown source') = ${filters.source.trim()}`);
  if (filters.createdFrom) conditions.push(Prisma.sql`c."createdAt" >= ${filters.createdFrom}`);
  if (filters.createdTo) conditions.push(Prisma.sql`c."createdAt" < ${filters.createdTo}`);
  const speedSeconds = Prisma.sql`EXTRACT(EPOCH FROM (c."pipelineFirstContactedAt" - c."pipelineLeadAt"))`;
  if (filters.speed === "UNDER_5") conditions.push(Prisma.sql`c."pipelineFirstContactedAt" IS NOT NULL AND ${speedSeconds} >= 0 AND ${speedSeconds} < 300`);
  else if (filters.speed === "FIVE_TO_30") conditions.push(Prisma.sql`c."pipelineFirstContactedAt" IS NOT NULL AND ${speedSeconds} >= 300 AND ${speedSeconds} <= 1800`);
  else if (filters.speed === "OVER_30") conditions.push(Prisma.sql`c."pipelineFirstContactedAt" IS NOT NULL AND ${speedSeconds} > 1800`);
  return Prisma.join(conditions, " AND ");
}

const QUALIFIED_VALUE = Prisma.sql`(SELECT COALESCE((SELECT MIN(eo.total) FROM "EstimateOption" eo WHERE eo."estimateId" = e.id AND eo."declinedAt" IS NULL), e.total) FROM "Estimate" e WHERE e."customerId" = c.id AND e."sentAt" IS NOT NULL ORDER BY e."sentAt" DESC LIMIT 1)`;
// The conversion event stores the full approved estimate/invoice value. Prefer that
// snapshot over invoices because an estimate approval can create a 50% deposit
// invoice, whose total is only the amount collected up front. Historical pipeline
// rows predate conversion events, so fall back to their first approved estimate
// before considering an invoice.
const APPROVED_ESTIMATE_VALUE = Prisma.sql`(
  SELECT COALESCE(
    (SELECT eo.total FROM "EstimateOption" eo WHERE eo.id = e."selectedOptionId" AND eo."estimateId" = e.id),
    e.total
  )
  FROM "Estimate" e
  WHERE e."customerId" = c.id
    AND e.status IN ('APPROVED'::"EstimateStatus", 'CONVERTED'::"EstimateStatus")
  ORDER BY COALESCE(e."approvedAt", e."updatedAt") ASC, e.id ASC
  LIMIT 1
)`;
const CONVERTED_VALUE = Prisma.sql`COALESCE(
  (SELECT MAX(pce.value) FROM "PipelineConversionEvent" pce WHERE pce."customerId" = c.id AND pce.stage = 'CONVERTED'),
  ${APPROVED_ESTIMATE_VALUE},
  (SELECT MAX(i.total) FROM "Invoice" i WHERE i."customerId" = c.id)
)`;
const SOLD_VALUE = Prisma.sql`COALESCE((SELECT MAX(i.total) FROM "Invoice" i WHERE i."customerId" = c.id AND i."paidAt" IS NOT NULL), (SELECT MAX(pce.value) FROM "PipelineConversionEvent" pce WHERE pce."customerId" = c.id AND pce.stage = 'SOLD'))`;

const PIPELINE_SELECT = Prisma.sql`
  SELECT c.id, c.name, c.phone, c.email, COALESCE(c.city, primary_property.city) AS city, COALESCE(c.zip, primary_property.zip) AS zip,
    c."createdAt", c."pipelineStage"::text AS "pipelineStage", c."pipelineLeadAt", c."pipelineQualifiedAt", c."pipelineConvertedAt", c."pipelineSoldAt", c."pipelineDisqualifiedAt",
    COALESCE(c."pipelineLeadSource", c."leadSource", c."attributionSource", c."attributionChannel") AS "pipelineLeadSource", c."pipelineFirstContactedAt",
    c."pipelineDeclinedAt", c."pipelineDeclineReason"::text AS "pipelineDeclineReason", c."pipelineFollowUpsPausedAt",
    ${QUALIFIED_VALUE}::float8 AS "qualifiedValue", ${CONVERTED_VALUE}::float8 AS "convertedValue", ${SOLD_VALUE}::float8 AS "soldValue",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pf.id, 'stage', pf.stage::text, 'sequence', pf.sequence, 'method', pf.method::text, 'status', pf.status::text, 'automated', pf.automated, 'completedAt', pf."completedAt", 'smsSentAt', pf."smsSentAt", 'emailSentAt', pf."emailSentAt") ORDER BY pf.stage, pf.sequence)
      FROM "PipelineFollowUp" pf WHERE pf."customerId" = c.id AND pf.status IN ('COMPLETED', 'SKIPPED')), '[]'::jsonb) AS "followUps"
  FROM "Customer" c LEFT JOIN LATERAL (SELECT p.city, p.zip FROM "CustomerProperty" p WHERE p."customerId" = c.id ORDER BY p."isPrimary" DESC, p."createdAt" ASC LIMIT 1) primary_property ON true
`;

export async function querySalesPipeline(companyId: string, filters: PipelineFilters, options: { skip: number; take: number }, scope: PipelineScope = {}) {
  const where = pipelineWhere(companyId, filters, scope);
  const sourceScope = scope.affiliateUserId
    ? Prisma.sql`AND c."affiliateUserId" = ${scope.affiliateUserId}`
    : Prisma.empty;
  const [rows, metricsRows, sourceRows] = await Promise.all([
    prisma.$queryRaw<PipelineRow[]>(Prisma.sql`${PIPELINE_SELECT} WHERE ${where} ORDER BY c."pipelineLeadAt" DESC, c.id ASC LIMIT ${options.take} OFFSET ${options.skip}`),
    prisma.$queryRaw<MetricsRow[]>(Prisma.sql`SELECT COUNT(*) AS "leadCount", COUNT(*) FILTER (WHERE c."pipelineQualifiedAt" IS NOT NULL) AS "qualifiedCount", COUNT(*) FILTER (WHERE c."pipelineConvertedAt" IS NOT NULL) AS "convertedCount", COUNT(*) FILTER (WHERE c."pipelineSoldAt" IS NOT NULL) AS "soldCount", AVG(EXTRACT(EPOCH FROM (c."pipelineFirstContactedAt" - c."pipelineLeadAt"))) FILTER (WHERE c."pipelineFirstContactedAt" >= c."pipelineLeadAt") AS "averageSpeedSeconds", SUM(${QUALIFIED_VALUE}) FILTER (WHERE c."pipelineQualifiedAt" IS NOT NULL) AS "qualifiedTotal", SUM(${CONVERTED_VALUE}) FILTER (WHERE c."pipelineConvertedAt" IS NOT NULL) AS "convertedTotal", SUM(${SOLD_VALUE}) FILTER (WHERE c."pipelineSoldAt" IS NOT NULL) AS "soldTotal" FROM "Customer" c WHERE ${where}`),
    prisma.$queryRaw<Array<{ source: string }>>(Prisma.sql`SELECT DISTINCT COALESCE(c."pipelineLeadSource", c."leadSource", c."attributionSource", c."attributionChannel", 'Unknown source') AS source FROM "Customer" c WHERE c."companyId" = ${companyId} AND c."givingProgramOnly" = false AND c."pipelineLeadAt" IS NOT NULL AND c."pipelineRemovedAt" IS NULL ${sourceScope} ORDER BY source`),
  ]);
  const raw = metricsRows[0];
  const metrics = { leadCount: Number(raw?.leadCount ?? 0), qualifiedCount: Number(raw?.qualifiedCount ?? 0), convertedCount: Number(raw?.convertedCount ?? 0), soldCount: Number(raw?.soldCount ?? 0), averageSpeedSeconds: raw?.averageSpeedSeconds == null ? null : Number(raw.averageSpeedSeconds), qualifiedTotal: Number(raw?.qualifiedTotal ?? 0), convertedTotal: Number(raw?.convertedTotal ?? 0), soldTotal: Number(raw?.soldTotal ?? 0) };
  return { rows: rows.map((row) => ({ ...row, speedSeconds: pipelineSpeedSeconds(row) })), total: metrics.leadCount, metrics, leadSources: sourceRows.map((row) => row.source) };
}

export async function exportSalesPipeline(companyId: string, filters: PipelineFilters, scope: PipelineScope = {}) {
  const where = pipelineWhere(companyId, filters, scope);
  const rows = await prisma.$queryRaw<PipelineRow[]>(Prisma.sql`${PIPELINE_SELECT} WHERE ${where} ORDER BY c."pipelineLeadAt" DESC, c.id ASC`);
  return rows.map((row) => ({ ...row, speedSeconds: pipelineSpeedSeconds(row) }));
}
