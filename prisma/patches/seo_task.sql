-- SEO AI task list (Marketing → SEO recommendations)
CREATE TABLE IF NOT EXISTS "SeoTask" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT,
  "rationale" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'ai',
  "batchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SeoTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SeoTask_companyId_completed_createdAt_idx"
  ON "SeoTask"("companyId", "completed", "createdAt");

CREATE INDEX IF NOT EXISTS "SeoTask_companyId_batchId_idx"
  ON "SeoTask"("companyId", "batchId");

ALTER TABLE "SeoTask"
  ADD CONSTRAINT "SeoTask_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
