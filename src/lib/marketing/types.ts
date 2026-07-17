import type { CampaignChannel, CampaignType } from "@prisma/client";

export type AudienceFilters = {
  cities?: string[];
  tags?: string[];
  servicedFrom?: string;
  servicedTo?: string;
  priceBookItemIds?: string[];
  /** When set, audience is limited to these customer IDs (still must match channel/block rules). */
  includeCustomerIds?: string[];
  /** Always removed from the audience after filters apply. */
  excludeCustomerIds?: string[];
};

export type CampaignFlowNodeType =
  | "TRIGGER"
  | "WAIT"
  | "SEND_EMAIL"
  | "SEND_SMS"
  | "BRANCH"
  | "EXIT";

export type CampaignFlowNodeInput = {
  id?: string;
  type: CampaignFlowNodeType;
  sortOrder: number;
  config: Record<string, unknown>;
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
  /** Automation decision-tree nodes (DRIP campaigns). */
  flowNodes: CampaignFlowNodeInput[];
};
