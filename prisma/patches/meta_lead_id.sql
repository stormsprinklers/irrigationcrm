-- Preserve Meta Instant Form lead IDs and attach them to CRM pipeline events.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "metaLeadId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "metaLeadId" TEXT;
ALTER TABLE "PipelineConversionEvent" ADD COLUMN IF NOT EXISTS "metaLeadId" TEXT;

UPDATE "Lead" SET
  "metaLeadId" = COALESCE("metaLeadId", NULLIF(COALESCE(
    metadata #>> '{tracking,facebook_lead_id}',
    metadata #>> '{attribution,facebook_lead_id}',
    metadata ->> 'facebook_lead_id',
    metadata ->> 'facebookLeadId',
    metadata ->> 'meta_lead_id',
    metadata ->> 'leadgen_id'
  ), ''))
WHERE metadata IS NOT NULL;

WITH first_lead AS (
  SELECT DISTINCT ON ("convertedCustomerId")
    "convertedCustomerId", "metaLeadId"
  FROM "Lead"
  WHERE "convertedCustomerId" IS NOT NULL
    AND "metaLeadId" IS NOT NULL
  ORDER BY "convertedCustomerId", "firstTouchAt" ASC NULLS LAST, "createdAt" ASC
)
UPDATE "Customer" c SET
  "metaLeadId" = COALESCE(c."metaLeadId", l."metaLeadId")
FROM first_lead l
WHERE c.id = l."convertedCustomerId";

UPDATE "PipelineConversionEvent" e SET
  "metaLeadId" = c."metaLeadId"
FROM "Customer" c
WHERE e."customerId" = c.id
  AND e."metaLeadId" IS NULL
  AND c."metaLeadId" IS NOT NULL;
