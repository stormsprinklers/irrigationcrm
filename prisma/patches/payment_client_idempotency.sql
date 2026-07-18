-- Offline iOS cash/check sync: prevent duplicate payment rows on retry
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "clientIdempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_clientIdempotencyKey_key" ON "Payment"("clientIdempotencyKey");
