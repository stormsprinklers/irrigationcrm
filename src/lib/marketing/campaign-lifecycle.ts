import { CampaignStatus } from "@prisma/client";

export const OPEN_CAMPAIGN_STATUSES: CampaignStatus[] = [
  CampaignStatus.DRAFT,
  CampaignStatus.SCHEDULED,
  CampaignStatus.ACTIVE,
];

export function isCampaignEditable(status: CampaignStatus | string) {
  return OPEN_CAMPAIGN_STATUSES.includes(status as CampaignStatus);
}
