ALTER TABLE "Vehicle"
ADD COLUMN IF NOT EXISTS "vehicleNumber" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_companyId_vehicleNumber_key"
ON "Vehicle"("companyId", "vehicleNumber");
