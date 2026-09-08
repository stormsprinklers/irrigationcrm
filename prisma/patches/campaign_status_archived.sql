-- Hide completed campaigns without deleting them.
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
