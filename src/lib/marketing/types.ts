import type { CampaignChannel, CampaignType } from "@prisma/client";

export type AudienceRecordType = "ALL" | "CUSTOMERS" | "CONTACTS";

export type AudienceFilters = {
  cities?: string[];
  /** Include customers who have at least one of these tags. */
  tags?: string[];
  /** Exclude customers who have any of these tags. */
  excludeTags?: string[];
  servicedFrom?: string;
  servicedTo?: string;
  priceBookItemIds?: string[];
  /** Paying customers vs never-paid contacts. Default ALL. */
  recordType?: AudienceRecordType;
  /** When set, audience is limited to these customer IDs (still must match channel/block rules). */
  includeCustomerIds?: string[];
  /** Always removed from the audience after filters apply. */
  excludeCustomerIds?: string[];
  /** Explicit empty audience, distinct from no manual selection. */
  selectNone?: boolean;
};

export type CampaignFlowNodeType =
  | "TRIGGER"
  | "WAIT"
  | "SEND_EMAIL"
  | "SEND_SMS"
  | "ADD_TAG"
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
  /** Overrides company email sender display name for this campaign. */
  senderName?: string;
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
  /** Campaign builder nodes. */
  flowNodes: CampaignFlowNodeInput[];
};
