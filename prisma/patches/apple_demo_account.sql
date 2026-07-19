-- Apple App Store demo technician account (no MFA / phone).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appleDemoAccount" BOOLEAN NOT NULL DEFAULT false;
