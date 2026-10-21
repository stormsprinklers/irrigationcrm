-- Additive rollout for the internal customer sales pipeline.
DO $$ BEGIN
  CREATE TYPE "SalesPipelineStage" AS ENUM ('LEAD', 'QUALIFIED', 'CONVERTED', 'SOLD', 'DISQUALIFIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "pipelineStage" "SalesPipelineStage",
  ADD COLUMN IF NOT EXISTS "pipelineLeadAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pipelineQualifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pipelineConvertedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pipelineSoldAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pipelineDisqualifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pipelineLeadSource" TEXT,
  ADD COLUMN IF NOT EXISTS "pipelineFirstContactedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pipelineLeadId" TEXT;

CREATE INDEX IF NOT EXISTS "Customer_companyId_pipelineStage_idx"
  ON "Customer"("companyId", "pipelineStage");
CREATE INDEX IF NOT EXISTS "Customer_companyId_pipelineLeadAt_idx"
  ON "Customer"("companyId", "pipelineLeadAt");

WITH lead_rollup AS (
  SELECT
    "convertedCustomerId" AS customer_id,
    MIN("createdAt") AS lead_at,
    MIN("contactedAt") AS contacted_at,
    (ARRAY_AGG(id ORDER BY "createdAt"))[1] AS lead_id,
    (ARRAY_AGG(source ORDER BY "createdAt") FILTER (WHERE source IS NOT NULL AND BTRIM(source) <> ''))[1] AS lead_source,
    BOOL_OR(status = 'SPAM'::"LeadStatus") AS has_spam
  FROM "Lead"
  WHERE "convertedCustomerId" IS NOT NULL
  GROUP BY "convertedCustomerId"
), estimate_rollup AS (
  SELECT
    "customerId" AS customer_id,
    MIN("sentAt") AS qualified_at,
    MIN(COALESCE("approvedAt", "updatedAt")) FILTER (
      WHERE status IN ('APPROVED'::"EstimateStatus", 'CONVERTED'::"EstimateStatus")
    ) AS converted_at
  FROM "Estimate"
  GROUP BY "customerId"
), payment_rollup AS (
  SELECT i."customerId" AS customer_id, MIN(p."paidAt") AS sold_at
  FROM "Payment" p
  JOIN "Invoice" i ON i.id = p."invoiceId"
  WHERE p."refundedAt" IS NULL
  GROUP BY i."customerId"
)
UPDATE "Customer" c
SET
  "pipelineStage" = CASE
    WHEN pr.sold_at IS NOT NULL OR c."pipelineSoldAt" IS NOT NULL THEN 'SOLD'::"SalesPipelineStage"
    WHEN er.converted_at IS NOT NULL OR c."pipelineConvertedAt" IS NOT NULL THEN 'CONVERTED'::"SalesPipelineStage"
    WHEN er.qualified_at IS NOT NULL OR c."pipelineQualifiedAt" IS NOT NULL THEN 'QUALIFIED'::"SalesPipelineStage"
    WHEN lr.has_spam AND c."pipelineStage" IS NULL THEN 'DISQUALIFIED'::"SalesPipelineStage"
    ELSE COALESCE(c."pipelineStage", 'LEAD'::"SalesPipelineStage")
  END,
  "pipelineLeadAt" = COALESCE(c."pipelineLeadAt", lr.lead_at, er.qualified_at, er.converted_at, pr.sold_at, c."createdAt"),
  "pipelineQualifiedAt" = COALESCE(c."pipelineQualifiedAt", er.qualified_at, er.converted_at, pr.sold_at),
  "pipelineConvertedAt" = COALESCE(c."pipelineConvertedAt", er.converted_at, pr.sold_at),
  "pipelineSoldAt" = COALESCE(c."pipelineSoldAt", pr.sold_at),
  "pipelineDisqualifiedAt" = CASE
    WHEN lr.has_spam AND er.qualified_at IS NULL AND er.converted_at IS NULL AND pr.sold_at IS NULL
      THEN COALESCE(c."pipelineDisqualifiedAt", lr.lead_at)
    ELSE c."pipelineDisqualifiedAt"
  END,
  "pipelineLeadSource" = COALESCE(c."pipelineLeadSource", NULLIF(BTRIM(c."leadSource"), ''), lr.lead_source, NULLIF(BTRIM(c."attributionSource"), ''), NULLIF(BTRIM(c."attributionChannel"), '')),
  "pipelineFirstContactedAt" = COALESCE(c."pipelineFirstContactedAt", lr.contacted_at),
  "pipelineLeadId" = COALESCE(c."pipelineLeadId", lr.lead_id)
FROM lead_rollup lr
FULL JOIN estimate_rollup er ON er.customer_id = lr.customer_id
FULL JOIN payment_rollup pr ON pr.customer_id = COALESCE(lr.customer_id, er.customer_id)
WHERE c.id = COALESCE(lr.customer_id, er.customer_id, pr.customer_id)
  AND c."pipelineStage" IS DISTINCT FROM 'SOLD'::"SalesPipelineStage";
