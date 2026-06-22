import type { CampaignChannel, CampaignType } from "@prisma/client";

export type AudienceFilters = {
  cities?: string[];
  tags?: string[];
  servicedFrom?: string;
  servicedTo?: string;
  priceBookItemIds?: string[];
};

export type DripSettings = {
  emailsPerDay?: number;
  smsPerDay?: number;
  startAt?: string;
};

export type CampaignStats = {
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  opened?: number;
  clicked?: number;
  total?: number;
};

export type AudiencePreviewCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  tags: string[];
};

export type CampaignStepInput = {
  sortOrder: number;
  channel: CampaignChannel;
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText: string;
  delayDays?: number;
};

export type CampaignFormState = {
  name: string;
  type: CampaignType;
  channel: CampaignChannel;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  aiPrompt: string;
  audienceFilters: AudienceFilters;
  dripSettings: DripSettings;
  steps: CampaignStepInput[];
};
