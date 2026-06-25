export const GOOGLE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export type Ga4Property = {
  propertyId: string;
  displayName: string;
  accountDisplayName: string;
};

export type Ga4Overview = {
  propertyId: string;
  startDate: string;
  endDate: string;
  totalSessions: number;
  organicSessions: number;
  conversions: number;
  organicConversions: number;
  engagementRate: number;
};

export type Ga4PageRow = {
  pagePath: string;
  screenPageViews: number;
  sessions: number;
};

export type Ga4ConversionRow = {
  eventName: string;
  eventCount: number;
  conversions: number;
};

export type Ga4DashboardData = {
  overview: Ga4Overview;
  pages: Ga4PageRow[];
  conversions: Ga4ConversionRow[];
};

export type Ga4Summary = {
  connected: boolean;
  propertyId: string | null;
  organicConversions: number | null;
  totalConversions: number | null;
};

export type Ga4ConnectionStatus = {
  connected: boolean;
  propertyId: string | null;
  connectedAt: string | null;
  configured: boolean;
  oauthEnv: {
    hasClientId: boolean;
    hasClientSecret: boolean;
  };
};
