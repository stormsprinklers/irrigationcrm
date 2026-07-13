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
  /**
   * Manager (MCC) customer ID to send as login-customer-id when querying this
   * client account. Null for manager rows and for clients accessed directly.
   */
  suggestedLoginCustomerId: string | null;
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
  startDate: string;
  endDate: string;
  rangeLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  activeCampaigns: number;
  campaigns: GoogleAdsCampaignRow[];
};

export type GoogleLsaCampaignRow = {
  id: string;
  name: string;
  status: string;
  budgetMicros: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

export type GoogleLsaLeadRow = {
  id: string;
  leadType: string;
  leadStatus: string;
  categoryId: string | null;
  serviceId: string | null;
  creationDateTime: string | null;
  leadCharged: boolean;
  consumerName: string | null;
  phoneNumber: string | null;
  email: string | null;
};

export type GoogleLsaCategoryRow = {
  categoryId: string;
  leads: number;
  chargedLeads: number;
  bookedLeads: number;
};

export type GoogleLsaSummary = {
  customerId: string;
  customerName: string;
  days: number;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  chargedLeads: number;
  bookedLeads: number;
  cpl: number | null;
  activeCampaigns: number;
  campaigns: GoogleLsaCampaignRow[];
  categories: GoogleLsaCategoryRow[];
  recentLeads: GoogleLsaLeadRow[];
};
