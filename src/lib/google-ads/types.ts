export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

export type GoogleAdsConnectionStatus = {
  connected: boolean;
  customerId: string | null;
  customerName: string | null;
  loginCustomerId: string | null;
  connectedAt: string | null;
  configured: boolean;
  hasDeveloperToken: boolean;
  oauthEnv: {
    hasClientId: boolean;
    hasClientSecret: boolean;
  };
  setupUrl: "/settings/integrations/google-ads";
};

export type GoogleAdsCustomer = {
  id: string;
  name: string;
  manager: boolean;
};

export type GoogleAdsCampaignRow = {
  id: string;
  name: string;
  status: string;
  channelType: string | null;
  budgetMicros: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
};

export type GoogleAdsSummary = {
  customerId: string;
  customerName: string;
  days: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  activeCampaigns: number;
  campaigns: GoogleAdsCampaignRow[];
};
