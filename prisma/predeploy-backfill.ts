/**
 * Backfills columns that Prisma cannot add as NOT NULL on non-empty tables
 * (@default(cuid()) is applied in the client, not in PostgreSQL).
 * Apply reviewed, additive compatibility changes before the application build.
 * Production deploys must not run `prisma db push` or accept destructive drift.
 */
import {
  CampaignEnrollmentStatus,
  Channel,
  PrismaClient,
  Scope,
  UserRole,
} from "@prisma/client";

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

async function ensureVehicleNumberColumn() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "vehicleNumber" TEXT`
  );
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_companyId_vehicleNumber_key"
    ON "Vehicle"("companyId", "vehicleNumber")
  `);
  console.log(`Ensured "Vehicle"."vehicleNumber" column and company unique index`);
}

async function ensureEstimateVslSettings() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "estimateVslEnabled" BOOLEAN NOT NULL DEFAULT false`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "estimateVslVideoUrl" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "estimateVslWaitSeconds" INTEGER NOT NULL DEFAULT 30`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "estimateVslViewedAt" TIMESTAMP(3)`
  );
  console.log("Ensured estimate VSL settings and customer completion field");
}

async function ensureGivingProgramSeparation() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "givingProgramOnly" BOOLEAN NOT NULL DEFAULT false`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Customer_companyId_givingProgramOnly_idx" ON "Customer"("companyId", "givingProgramOnly")`
  );

  // Only classify historical Share the Cheer contacts that never became an
  // operational customer. Existing customers who participated in the program
  // keep their normal customer and marketing behavior.
  const classified = await prisma.$executeRawUnsafe(`
    UPDATE "Customer" AS c
    SET "givingProgramOnly" = true,
        "pipelineRemovedAt" = COALESCE(c."pipelineRemovedAt", CURRENT_TIMESTAMP)
    WHERE lower(COALESCE(c."leadSource", '')) IN ('share-the-cheer-nomination', 'share-the-cheer-partner')
      AND NOT EXISTS (
        SELECT 1 FROM "Lead" l
        WHERE l."convertedCustomerId" = c.id
          AND lower(COALESCE(l.source, '')) NOT IN ('share-the-cheer-nomination', 'share-the-cheer-partner')
      )
      AND NOT EXISTS (SELECT 1 FROM "ScheduledJob" v WHERE v."customerId" = c.id)
      AND NOT EXISTS (SELECT 1 FROM "Estimate" e WHERE e."customerId" = c.id)
      AND NOT EXISTS (SELECT 1 FROM "Invoice" i WHERE i."customerId" = c.id)
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "CampaignEnrollment" ce
    SET status = 'CANCELLED'
    FROM "Customer" c
    WHERE ce."customerId" = c.id
      AND c."givingProgramOnly" = true
      AND ce.status IN ('ACTIVE', 'PAUSED')
  `);
  await prisma.$executeRawUnsafe(`
    DELETE FROM "CampaignRecipient" cr
    USING "Customer" c
    WHERE cr."customerId" = c.id
      AND c."givingProgramOnly" = true
      AND cr.status = 'pending'
  `);
  console.log(`Separated giving-program contacts (${classified} classified)`);
}

const WEBSITE_FORMS_SYSTEM_KIND = "WEBSITE_FORMS";

async function ensureWebsiteFormsSystemUser(companyId: string) {
  const existing = await prisma.user.findFirst({
    where: { companyId, systemKind: WEBSITE_FORMS_SYSTEM_KIND },
    select: { id: true },
  });
  if (existing) return existing.id;

  const email = `website-forms+${companyId}@system.local`;
  const byEmail = await prisma.user.findFirst({
    where: { companyId, email },
    select: { id: true, systemKind: true },
  });
  if (byEmail) {
    if (byEmail.systemKind !== WEBSITE_FORMS_SYSTEM_KIND) {
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { systemKind: WEBSITE_FORMS_SYSTEM_KIND },
      });
    }
    return byEmail.id;
  }

  const created = await prisma.user.create({
    data: {
      companyId,
      email,
      name: "Website Forms",
      firstName: "Website",
      lastName: "Forms",
      role: UserRole.CSR,
      systemKind: WEBSITE_FORMS_SYSTEM_KIND,
      passwordHash: null,
    },
    select: { id: true },
  });
  return created.id;
}

function storedPhotosForBackfill(
  metadata: unknown,
  companyId: string,
  leadId: string
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const photos = (metadata as Record<string, unknown>).photos;
  if (!Array.isArray(photos)) return [];
  const expectedPrefix = `leads/${companyId}/${leadId}/`;

  return photos.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const photo = value as Record<string, unknown>;
    const url = typeof photo.url === "string" ? photo.url.trim() : "";
    const pathname =
      typeof photo.pathname === "string" ? photo.pathname.replace(/^\/+/, "") : "";
    if (!url || !pathname.startsWith(expectedPrefix)) return [];
    try {
      if (!new URL(url).hostname.endsWith(".blob.vercel-storage.com")) return [];
    } catch {
      return [];
    }
    return [
      {
        url,
        fileName:
          typeof photo.name === "string" && photo.name.trim()
            ? photo.name.trim()
            : `quote-photo-${index + 1}.jpg`,
        mimeType:
          typeof photo.mimeType === "string" && photo.mimeType.startsWith("image/")
            ? photo.mimeType
            : "image/jpeg",
      },
    ];
  });
}

/** Make historical website quote photos visible in each linked customer profile. */
async function backfillLeadPhotoAttachments() {
  const leads = await prisma.lead.findMany({
    where: { convertedCustomerId: { not: null } },
    select: {
      id: true,
      companyId: true,
      convertedCustomerId: true,
      metadata: true,
    },
  });
  const uploaderByCompany = new Map<string, string>();
  let attached = 0;

  for (const lead of leads) {
    if (!lead.convertedCustomerId) continue;
    const photos = storedPhotosForBackfill(lead.metadata, lead.companyId, lead.id);
    if (!photos.length) continue;

    const existing = await prisma.customerAttachment.findMany({
      where: {
        customerId: lead.convertedCustomerId,
        blobUrl: { in: photos.map((photo) => photo.url) },
      },
      select: { blobUrl: true },
    });
    const existingUrls = new Set(existing.map((attachment) => attachment.blobUrl));
    const missing = photos.filter((photo) => !existingUrls.has(photo.url));
    if (!missing.length) continue;

    let uploadedById = uploaderByCompany.get(lead.companyId);
    if (!uploadedById) {
      uploadedById = await ensureWebsiteFormsSystemUser(lead.companyId);
      uploaderByCompany.set(lead.companyId, uploadedById);
    }
    const created = await prisma.customerAttachment.createMany({
      data: missing.map((photo) => ({
        customerId: lead.convertedCustomerId!,
        uploadedById,
        blobUrl: photo.url,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
      })),
    });
    attached += created.count;
  }

  console.log(`Backfilled lead photos into customer attachments (${attached} created)`);
}

async function ensureSecurityRateLimitTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SecurityRateLimitBucket" (
      "key" TEXT PRIMARY KEY,
      "count" INTEGER NOT NULL DEFAULT 0,
      "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "blockedUntil" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SecurityRateLimitBucket_updatedAt_idx"
    ON "SecurityRateLimitBucket"("updatedAt")
  `);
}

async function ensureMarketerRole() {
  await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MARKETER'`);
}

async function ensureSalesPipeline() {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "SalesPipelineStage" AS ENUM ('LEAD', 'QUALIFIED', 'CONVERTED', 'SOLD', 'DISQUALIFIED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  for (const [column, type] of [
    ["pipelineStage", '"SalesPipelineStage"'],
    ["pipelineLeadAt", "TIMESTAMP(3)"],
    ["pipelineQualifiedAt", "TIMESTAMP(3)"],
    ["pipelineConvertedAt", "TIMESTAMP(3)"],
    ["pipelineSoldAt", "TIMESTAMP(3)"],
    ["pipelineDisqualifiedAt", "TIMESTAMP(3)"],
    ["pipelineLeadSource", "TEXT"],
    ["pipelineFirstContactedAt", "TIMESTAMP(3)"],
    ["pipelineLeadId", "TEXT"],
  ] as const) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "${column}" ${type}`
    );
  }
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Customer_companyId_pipelineStage_idx" ON "Customer"("companyId", "pipelineStage")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Customer_companyId_pipelineLeadAt_idx" ON "Customer"("companyId", "pipelineLeadAt")`);

  const updated = await prisma.$executeRawUnsafe(`
    WITH lead_rollup AS (
      SELECT "convertedCustomerId" AS customer_id,
        MIN("createdAt") AS lead_at,
        MIN("contactedAt") AS contacted_at,
        (ARRAY_AGG(id ORDER BY "createdAt"))[1] AS lead_id,
        (ARRAY_AGG(source ORDER BY "createdAt") FILTER (WHERE source IS NOT NULL AND BTRIM(source) <> ''))[1] AS lead_source,
        BOOL_OR(status = 'SPAM'::"LeadStatus") AS has_spam
      FROM "Lead" WHERE "convertedCustomerId" IS NOT NULL GROUP BY "convertedCustomerId"
    ), estimate_rollup AS (
      SELECT "customerId" AS customer_id,
        MIN("sentAt") AS qualified_at,
        MIN(COALESCE("approvedAt", "updatedAt")) FILTER (WHERE status IN ('APPROVED'::"EstimateStatus", 'CONVERTED'::"EstimateStatus")) AS converted_at
      FROM "Estimate" GROUP BY "customerId"
    ), payment_rollup AS (
      SELECT i."customerId" AS customer_id, MIN(p."paidAt") AS sold_at
      FROM "Payment" p JOIN "Invoice" i ON i.id = p."invoiceId"
      WHERE p."refundedAt" IS NULL GROUP BY i."customerId"
    )
    UPDATE "Customer" c SET
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
      "pipelineDisqualifiedAt" = CASE WHEN lr.has_spam AND er.qualified_at IS NULL AND er.converted_at IS NULL AND pr.sold_at IS NULL THEN COALESCE(c."pipelineDisqualifiedAt", lr.lead_at) ELSE c."pipelineDisqualifiedAt" END,
      "pipelineLeadSource" = COALESCE(c."pipelineLeadSource", NULLIF(BTRIM(c."leadSource"), ''), lr.lead_source, NULLIF(BTRIM(c."attributionSource"), ''), NULLIF(BTRIM(c."attributionChannel"), '')),
      "pipelineFirstContactedAt" = COALESCE(c."pipelineFirstContactedAt", lr.contacted_at),
      "pipelineLeadId" = COALESCE(c."pipelineLeadId", lr.lead_id)
    FROM lead_rollup lr
    FULL JOIN estimate_rollup er ON er.customer_id = lr.customer_id
    FULL JOIN payment_rollup pr ON pr.customer_id = COALESCE(lr.customer_id, er.customer_id)
    WHERE c.id = COALESCE(lr.customer_id, er.customer_id, pr.customer_id)
      AND c."pipelineStage" IS DISTINCT FROM 'SOLD'::"SalesPipelineStage"
  `);
  console.log(`Ensured customer sales pipeline (${updated} historical customers updated)`);
}

async function ensureCustomerTrackingData() {
  for (const table of ["Customer", "Lead"] as const) {
    for (const column of ["gbraid", "wbraid", "fbc", "fbp", "metaLeadId", "userAgent"] as const) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" TEXT`
      );
    }
  }

  await prisma.$executeRawUnsafe(`
    UPDATE "Lead" SET
      gbraid = COALESCE(gbraid, NULLIF(COALESCE(metadata #>> '{tracking,gbraid}', metadata #>> '{attribution,gbraid}', metadata ->> 'gbraid'), '')),
      wbraid = COALESCE(wbraid, NULLIF(COALESCE(metadata #>> '{tracking,wbraid}', metadata #>> '{attribution,wbraid}', metadata ->> 'wbraid'), '')),
      fbc = COALESCE(fbc, NULLIF(COALESCE(metadata #>> '{tracking,fbc}', metadata #>> '{attribution,fbc}', metadata ->> 'fbc'), '')),
      fbp = COALESCE(fbp, NULLIF(COALESCE(metadata #>> '{tracking,fbp}', metadata #>> '{attribution,fbp}', metadata ->> 'fbp'), '')),
      "metaLeadId" = COALESCE("metaLeadId", NULLIF(COALESCE(
        metadata #>> '{tracking,facebook_lead_id}',
        metadata #>> '{attribution,facebook_lead_id}',
        metadata ->> 'facebook_lead_id',
        metadata ->> 'facebookLeadId',
        metadata ->> 'meta_lead_id',
        metadata ->> 'leadgen_id'
      ), '')),
      "userAgent" = COALESCE("userAgent", NULLIF(COALESCE(metadata #>> '{tracking,user_agent}', metadata #>> '{attribution,user_agent}', metadata ->> 'user_agent'), ''))
    WHERE metadata IS NOT NULL
  `);

  await prisma.$executeRawUnsafe(`
    WITH first_lead AS (
      SELECT DISTINCT ON ("convertedCustomerId")
        "convertedCustomerId", gbraid, wbraid, fbc, fbp, "metaLeadId", "userAgent"
      FROM "Lead"
      WHERE "convertedCustomerId" IS NOT NULL
      ORDER BY "convertedCustomerId", "firstTouchAt" ASC NULLS LAST, "createdAt" ASC
    )
    UPDATE "Customer" c SET
      gbraid = COALESCE(c.gbraid, l.gbraid),
      wbraid = COALESCE(c.wbraid, l.wbraid),
      fbc = COALESCE(c.fbc, l.fbc),
      fbp = COALESCE(c.fbp, l.fbp),
      "metaLeadId" = COALESCE(c."metaLeadId", l."metaLeadId"),
      "userAgent" = COALESCE(c."userAgent", l."userAgent")
    FROM first_lead l
    WHERE c.id = l."convertedCustomerId"
  `);

  await prisma.$executeRawUnsafe(`
    WITH first_meta_lead AS (
      SELECT DISTINCT ON ("convertedCustomerId")
        "convertedCustomerId", "metaLeadId"
      FROM "Lead"
      WHERE "convertedCustomerId" IS NOT NULL
        AND "metaLeadId" IS NOT NULL
      ORDER BY "convertedCustomerId", "firstTouchAt" ASC NULLS LAST, "createdAt" ASC
    )
    UPDATE "Customer" c SET
      "metaLeadId" = l."metaLeadId"
    FROM first_meta_lead l
    WHERE c.id = l."convertedCustomerId"
      AND c."metaLeadId" IS NULL
  `);
  console.log("Ensured customer and lead tracking data columns");
}

async function ensurePipelineConversionDelivery() {
  const companyColumns = [
    "googleAdsPipelineLeadActionId",
    "googleAdsPipelineQualifiedActionId",
    "googleAdsPipelineConvertedActionId",
    "googleAdsPipelineSoldActionId",
    "metaConversionsAccessToken",
    "metaConversionsDatasetId",
    "metaConversionsTestEventCode",
  ];
  for (const column of companyColumns) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "${column}" TEXT`
    );
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "googleAdsPipelineConfiguredAt" TIMESTAMP(3)`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "metaConversionsConfiguredAt" TIMESTAMP(3)`
  );

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "PipelineConversionPlatform" AS ENUM ('GOOGLE', 'META');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "PipelineConversionDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PipelineConversionEvent" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "stage" "SalesPipelineStage" NOT NULL,
      "occurredAt" TIMESTAMP(3) NOT NULL,
      "value" DECIMAL(12,2),
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "eventSource" TEXT NOT NULL DEFAULT 'WEB',
      "emailSha256" TEXT,
      "phoneSha256" TEXT,
      "gclid" TEXT,
      "gbraid" TEXT,
      "wbraid" TEXT,
      "fbc" TEXT,
      "fbp" TEXT,
      "metaLeadId" TEXT,
      "userAgent" TEXT,
      "sourceEntityType" TEXT,
      "sourceEntityId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PipelineConversionEvent_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PipelineConversionDelivery" (
      "id" TEXT NOT NULL,
      "eventId" TEXT NOT NULL,
      "platform" "PipelineConversionPlatform" NOT NULL,
      "status" "PipelineConversionDeliveryStatus" NOT NULL DEFAULT 'PENDING',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "leaseUntil" TIMESTAMP(3),
      "sentAt" TIMESTAMP(3),
      "providerRequestId" TEXT,
      "lastError" TEXT,
      "responseMetadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PipelineConversionDelivery_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "PipelineConversionEvent" ADD COLUMN IF NOT EXISTS "eventSource" TEXT NOT NULL DEFAULT 'WEB'`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "PipelineConversionEvent" ADD COLUMN IF NOT EXISTS "metaLeadId" TEXT`
  );
  await prisma.$executeRawUnsafe(`
    UPDATE "PipelineConversionEvent" e
    SET "metaLeadId" = c."metaLeadId"
    FROM "Customer" c
    WHERE e."customerId" = c.id
      AND e."metaLeadId" IS NULL
      AND c."metaLeadId" IS NOT NULL
  `);

  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "PipelineConversionEvent_companyId_customerId_stage_key" ON "PipelineConversionEvent"("companyId", "customerId", "stage")`,
    `CREATE INDEX IF NOT EXISTS "PipelineConversionEvent_companyId_occurredAt_idx" ON "PipelineConversionEvent"("companyId", "occurredAt")`,
    `CREATE INDEX IF NOT EXISTS "PipelineConversionEvent_customerId_occurredAt_idx" ON "PipelineConversionEvent"("customerId", "occurredAt")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PipelineConversionDelivery_eventId_platform_key" ON "PipelineConversionDelivery"("eventId", "platform")`,
    `CREATE INDEX IF NOT EXISTS "PipelineConversionDelivery_status_nextAttemptAt_idx" ON "PipelineConversionDelivery"("status", "nextAttemptAt")`,
    `CREATE INDEX IF NOT EXISTS "PipelineConversionDelivery_leaseUntil_idx" ON "PipelineConversionDelivery"("leaseUntil")`,
  ];
  for (const statement of indexes) await prisma.$executeRawUnsafe(statement);

  const foreignKeys = [
    `ALTER TABLE "PipelineConversionEvent" ADD CONSTRAINT "PipelineConversionEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "PipelineConversionEvent" ADD CONSTRAINT "PipelineConversionEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "PipelineConversionDelivery" ADD CONSTRAINT "PipelineConversionDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PipelineConversionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  ];
  for (const statement of foreignKeys) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      if (!(error instanceof Error) || !/already exists|duplicate/i.test(error.message)) throw error;
    }
  }
  console.log("Ensured pipeline conversion delivery tables and configuration columns");
}

async function ensureSecurityHardeningTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OAuthStateNonce" (
      "id" TEXT PRIMARY KEY,
      "nonceHash" TEXT NOT NULL UNIQUE,
      "companyId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "consumedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OAuthStateNonce_companyId_provider_idx" ON "OAuthStateNonce"("companyId", "provider")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OAuthStateNonce_expiresAt_idx" ON "OAuthStateNonce"("expiresAt")`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WebhookEventReceipt" (
      "key" TEXT PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "eventId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "attempts" INTEGER NOT NULL DEFAULT 1,
      "leaseUntil" TIMESTAMP(3),
      "processedAt" TIMESTAMP(3),
      "lastError" TEXT,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WebhookEventReceipt_provider_eventId_idx" ON "WebhookEventReceipt"("provider", "eventId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WebhookEventReceipt_expiresAt_idx" ON "WebhookEventReceipt"("expiresAt")`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SecurityAuditEvent" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT,
      "actorId" TEXT,
      "event" TEXT NOT NULL,
      "outcome" TEXT NOT NULL,
      "audience" TEXT,
      "subjectHash" TEXT,
      "ipHash" TEXT,
      "resourceType" TEXT,
      "resourceId" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_companyId_createdAt_idx" ON "SecurityAuditEvent"("companyId", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_event_createdAt_idx" ON "SecurityAuditEvent"("event", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_subjectHash_createdAt_idx" ON "SecurityAuditEvent"("subjectHash", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SecurityAuditEvent_createdAt_idx" ON "SecurityAuditEvent"("createdAt")`);
}

async function ensureExpiringPublicLinks(table: "Estimate" | "Invoice") {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "publicTokenExpiresAt" TIMESTAMP(3)`
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "publicTokenExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '180 days' WHERE "publicTokenExpiresAt" IS NULL`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${table}" ALTER COLUMN "publicTokenExpiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '180 days')`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${table}" ALTER COLUMN "publicTokenExpiresAt" SET NOT NULL`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "publicTokenRevokedAt" TIMESTAMP(3)`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "publicTokenVersion" INTEGER NOT NULL DEFAULT 1`
  );
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

/** Deploy the private owner-assistant tables without destructive schema push. */
async function ensureOwnerAssistantTables() {
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "AuthMfaPurpose" ADD VALUE IF NOT EXISTS 'OWNER_ASSISTANT_SETTINGS'`
  );
  const statements = [
    `CREATE TABLE IF NOT EXISTS "OwnerAssistantConfig" (
      "id" TEXT NOT NULL, "ownerUserId" TEXT NOT NULL, "homeCompanyId" TEXT NOT NULL,
      "phoneNumberId" TEXT, "enabled" BOOLEAN NOT NULL DEFAULT false,
      "name" TEXT NOT NULL DEFAULT 'Owner Assistant', "authorizedPhoneE164" TEXT,
      "pinHash" TEXT, "voice" TEXT NOT NULL DEFAULT 'alloy',
      "availabilityJson" JSONB NOT NULL DEFAULT '{"mode":"ALWAYS"}',
      "maxCallMinutes" INTEGER NOT NULL DEFAULT 15, "allOperatedCompanies" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "OwnerAssistantConfig_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "OwnerAssistantSession" (
      "id" TEXT NOT NULL, "configId" TEXT NOT NULL, "companyId" TEXT NOT NULL,
      "providerSid" TEXT NOT NULL, "channel" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'CONNECTING',
      "fromE164" TEXT NOT NULL, "toE164" TEXT NOT NULL, "pinVerifiedAt" TIMESTAMP(3),
      "failedPinAttempts" INTEGER NOT NULL DEFAULT 0, "activeCompanyId" TEXT,
      "transcript" TEXT NOT NULL DEFAULT '', "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "endedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OwnerAssistantSession_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "OwnerAssistantMessage" (
      "id" TEXT NOT NULL, "configId" TEXT NOT NULL, "providerSid" TEXT, "role" TEXT NOT NULL,
      "channel" TEXT NOT NULL, "content" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OwnerAssistantMessage_pkey" PRIMARY KEY ("id"))`,
    `CREATE TABLE IF NOT EXISTS "OwnerAssistantToolInvocation" (
      "id" TEXT NOT NULL, "configId" TEXT NOT NULL, "sessionId" TEXT, "companyId" TEXT,
      "tool" TEXT NOT NULL, "argsHash" TEXT NOT NULL, "resultCode" TEXT NOT NULL,
      "latencyMs" INTEGER NOT NULL DEFAULT 0, "errorMessage" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OwnerAssistantToolInvocation_pkey" PRIMARY KEY ("id"))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "OwnerAssistantConfig_ownerUserId_key" ON "OwnerAssistantConfig"("ownerUserId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "OwnerAssistantConfig_phoneNumberId_key" ON "OwnerAssistantConfig"("phoneNumberId")`,
    `CREATE INDEX IF NOT EXISTS "OwnerAssistantConfig_homeCompanyId_idx" ON "OwnerAssistantConfig"("homeCompanyId")`,
    `CREATE INDEX IF NOT EXISTS "OwnerAssistantConfig_authorizedPhoneE164_idx" ON "OwnerAssistantConfig"("authorizedPhoneE164")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "OwnerAssistantSession_providerSid_key" ON "OwnerAssistantSession"("providerSid")`,
    `CREATE INDEX IF NOT EXISTS "OwnerAssistantSession_configId_createdAt_idx" ON "OwnerAssistantSession"("configId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "OwnerAssistantSession_companyId_status_idx" ON "OwnerAssistantSession"("companyId", "status")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "OwnerAssistantMessage_providerSid_key" ON "OwnerAssistantMessage"("providerSid")`,
    `CREATE INDEX IF NOT EXISTS "OwnerAssistantMessage_configId_createdAt_idx" ON "OwnerAssistantMessage"("configId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "OwnerAssistantToolInvocation_configId_createdAt_idx" ON "OwnerAssistantToolInvocation"("configId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "OwnerAssistantToolInvocation_sessionId_createdAt_idx" ON "OwnerAssistantToolInvocation"("sessionId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "OwnerAssistantToolInvocation_companyId_tool_idx" ON "OwnerAssistantToolInvocation"("companyId", "tool")`,
  ];
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);

  const foreignKeys = [
    `ALTER TABLE "OwnerAssistantConfig" ADD CONSTRAINT "OwnerAssistantConfig_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "OwnerAssistantConfig" ADD CONSTRAINT "OwnerAssistantConfig_homeCompanyId_fkey" FOREIGN KEY ("homeCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "OwnerAssistantConfig" ADD CONSTRAINT "OwnerAssistantConfig_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `ALTER TABLE "OwnerAssistantSession" ADD CONSTRAINT "OwnerAssistantSession_configId_fkey" FOREIGN KEY ("configId") REFERENCES "OwnerAssistantConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "OwnerAssistantSession" ADD CONSTRAINT "OwnerAssistantSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "OwnerAssistantMessage" ADD CONSTRAINT "OwnerAssistantMessage_configId_fkey" FOREIGN KEY ("configId") REFERENCES "OwnerAssistantConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "OwnerAssistantToolInvocation" ADD CONSTRAINT "OwnerAssistantToolInvocation_configId_fkey" FOREIGN KEY ("configId") REFERENCES "OwnerAssistantConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "OwnerAssistantToolInvocation" ADD CONSTRAINT "OwnerAssistantToolInvocation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OwnerAssistantSession"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    `ALTER TABLE "OwnerAssistantToolInvocation" ADD CONSTRAINT "OwnerAssistantToolInvocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  ];
  for (const statement of foreignKeys) {
    try { await prisma.$executeRawUnsafe(statement); } catch (error) {
      if (!(error instanceof Error) || !/already exists|duplicate/i.test(error.message)) throw error;
    }
  }
  console.log("Ensured owner assistant tables");
}

async function ensurePipelineFollowUps() {
  const statements = [
    `DO $$ BEGIN CREATE TYPE "PipelineDeclineReason" AS ENUM ('PRICING','TIMING','UNRESPONSIVE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE "PipelineFollowUpMethod" AS ENUM ('CALL','SMS','EMAIL','SMS_EMAIL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN CREATE TYPE "PipelineFollowUpStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','SKIPPED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "pipelineFollowUpsEnabled" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "pipelineFollowUpsEnabledAt" TIMESTAMP(3)`,
    `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "pipelineFollowUpSettings" JSONB`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pipelineRemovedAt" TIMESTAMP(3)`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pipelineRemovedById" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pipelineDeclinedAt" TIMESTAMP(3)`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pipelineDeclineReason" "PipelineDeclineReason"`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pipelineDeclinedById" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pipelineFollowUpsPausedAt" TIMESTAMP(3)`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pipelineFollowUpsPausedById" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pipelineFollowUpsResumedAt" TIMESTAMP(3)`,
    `CREATE TABLE IF NOT EXISTS "PipelineFollowUp" (
      "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
      "stage" "SalesPipelineStage" NOT NULL, "sequence" INTEGER NOT NULL,
      "method" "PipelineFollowUpMethod" NOT NULL, "status" "PipelineFollowUpStatus" NOT NULL DEFAULT 'PENDING',
      "automated" BOOLEAN NOT NULL DEFAULT false, "performedById" TEXT, "scheduledFor" TIMESTAMP(3),
      "attemptedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "smsSentAt" TIMESTAMP(3), "emailSentAt" TIMESTAMP(3),
      "subject" TEXT, "body" TEXT, "lastError" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "PipelineFollowUp_pkey" PRIMARY KEY ("id"))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PipelineFollowUp_customerId_stage_sequence_key" ON "PipelineFollowUp"("customerId","stage","sequence")`,
    `CREATE INDEX IF NOT EXISTS "PipelineFollowUp_companyId_status_scheduledFor_idx" ON "PipelineFollowUp"("companyId","status","scheduledFor")`,
    `CREATE INDEX IF NOT EXISTS "PipelineFollowUp_customerId_stage_sequence_idx" ON "PipelineFollowUp"("customerId","stage","sequence")`,
  ];
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
  for (const statement of [
    `ALTER TABLE "PipelineFollowUp" ADD CONSTRAINT "PipelineFollowUp_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE "PipelineFollowUp" ADD CONSTRAINT "PipelineFollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  ]) {
    try { await prisma.$executeRawUnsafe(statement); } catch (error) {
      if (!(error instanceof Error) || !/already exists|duplicate/i.test(error.message)) throw error;
    }
  }
  console.log("Ensured pipeline follow-up tables and fields");
}

async function main() {
  await ensureMarketerRole();
  await ensureSalesPipeline();
  await ensureCustomerTrackingData();
  await ensurePipelineConversionDelivery();
  await ensurePipelineFollowUps();
  await ensureOwnerAssistantTables();
  await ensureSecurityRateLimitTable();
  await ensureSecurityHardeningTables();
  await backfillPublicToken("Estimate");
  await backfillPublicToken("Invoice");
  await ensureExpiringPublicLinks("Estimate");
  await ensureExpiringPublicLinks("Invoice");
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
    await ensureVehicleNumberColumn();
  } catch (err) {
    console.warn("Vehicle number column ensure skipped:", err);
  }
  try {
    await backfillLeadPhotoAttachments();
  } catch (err) {
    console.warn("Lead photo attachment backfill skipped:", err);
  }
  try {
    await ensureEstimateDepositThresholds();
  } catch (err) {
    console.warn("Estimate deposit threshold ensure skipped:", err);
  }
  await ensureEstimateVslSettings();
  await ensureGivingProgramSeparation();
}

main()
  .catch((err) => {
    console.error("predeploy-backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
