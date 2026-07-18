-- Estimate numbers + multi-option packages (EST-1012 / EST-1012A)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "estimatePrefix" TEXT DEFAULT 'EST';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "estimateNextNumber" INTEGER DEFAULT 1;

ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "estimateNumber" TEXT;
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "selectedOptionId" TEXT;

CREATE TABLE IF NOT EXISTS "EstimateOption" (
  "id" TEXT PRIMARY KEY,
  "estimateId" TEXT NOT NULL REFERENCES "Estimate"("id") ON DELETE CASCADE,
  "letter" TEXT,
  "label" TEXT NOT NULL DEFAULT 'Option',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "discountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "EstimateOption_estimateId_sortOrder_idx" ON "EstimateOption"("estimateId", "sortOrder");

ALTER TABLE "EstimateLineItem" ADD COLUMN IF NOT EXISTS "optionId" TEXT;
ALTER TABLE "Discount" ADD COLUMN IF NOT EXISTS "optionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_companyId_estimateNumber_key" ON "Estimate"("companyId", "estimateNumber");
CREATE INDEX IF NOT EXISTS "Estimate_selectedOptionId_idx" ON "Estimate"("selectedOptionId");
CREATE INDEX IF NOT EXISTS "EstimateLineItem_optionId_idx" ON "EstimateLineItem"("optionId");
CREATE INDEX IF NOT EXISTS "Discount_optionId_idx" ON "Discount"("optionId");
