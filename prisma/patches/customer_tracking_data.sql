-- Additive rollout for website form tracking fields on leads and customers.
ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS gbraid TEXT,
  ADD COLUMN IF NOT EXISTS wbraid TEXT,
  ADD COLUMN IF NOT EXISTS fbc TEXT,
  ADD COLUMN IF NOT EXISTS fbp TEXT,
  ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS gbraid TEXT,
  ADD COLUMN IF NOT EXISTS wbraid TEXT,
  ADD COLUMN IF NOT EXISTS fbc TEXT,
  ADD COLUMN IF NOT EXISTS fbp TEXT,
  ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

UPDATE "Lead" SET
  gbraid = COALESCE(gbraid, NULLIF(COALESCE(metadata #>> '{tracking,gbraid}', metadata #>> '{attribution,gbraid}', metadata ->> 'gbraid'), '')),
  wbraid = COALESCE(wbraid, NULLIF(COALESCE(metadata #>> '{tracking,wbraid}', metadata #>> '{attribution,wbraid}', metadata ->> 'wbraid'), '')),
  fbc = COALESCE(fbc, NULLIF(COALESCE(metadata #>> '{tracking,fbc}', metadata #>> '{attribution,fbc}', metadata ->> 'fbc'), '')),
  fbp = COALESCE(fbp, NULLIF(COALESCE(metadata #>> '{tracking,fbp}', metadata #>> '{attribution,fbp}', metadata ->> 'fbp'), '')),
  "userAgent" = COALESCE("userAgent", NULLIF(COALESCE(metadata #>> '{tracking,user_agent}', metadata #>> '{attribution,user_agent}', metadata ->> 'user_agent'), ''))
WHERE metadata IS NOT NULL;

WITH first_lead AS (
  SELECT DISTINCT ON ("convertedCustomerId")
    "convertedCustomerId", gbraid, wbraid, fbc, fbp, "userAgent"
  FROM "Lead"
  WHERE "convertedCustomerId" IS NOT NULL
  ORDER BY "convertedCustomerId", "firstTouchAt" ASC NULLS LAST, "createdAt" ASC
)
UPDATE "Customer" c SET
  gbraid = COALESCE(c.gbraid, l.gbraid),
  wbraid = COALESCE(c.wbraid, l.wbraid),
  fbc = COALESCE(c.fbc, l.fbc),
  fbp = COALESCE(c.fbp, l.fbp),
  "userAgent" = COALESCE(c."userAgent", l."userAgent")
FROM first_lead l
WHERE c.id = l."convertedCustomerId";
