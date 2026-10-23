export type CustomerDTO = {
  id: string;
  name: string;
  companyName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  secondaryEmails?: string[];
  leadSource: string | null;
  attributionChannel: string | null;
  attributionCampaign: string | null;
  attributionSource: string | null;
  attributionMedium: string | null;
  attributionContent: string | null;
  attributionTerm: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbc: string | null;
  fbp: string | null;
  metaLeadId: string | null;
  userAgent: string | null;
  firstTouchAt: string | null;
  firstTouchMethod: string | null;
  status: "ACTIVE" | "ARCHIVED";
  doNotService: boolean;
  marketingEmailOptOut: boolean;
  marketingSmsOptOut: boolean;
  appointmentReminderEmailOptOut: boolean;
  appointmentReminderSmsOptOut: boolean;
  tags: string[];
  pipelineStage: "LEAD" | "QUALIFIED" | "CONVERTED" | "SOLD" | "DISQUALIFIED" | null;
  pipelineLeadAt: string | null;
  pipelineQualifiedAt: string | null;
  pipelineConvertedAt: string | null;
  pipelineSoldAt: string | null;
  pipelineDisqualifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  propertyCount?: number;
  visitCount?: number;
  estimateCount?: number;
  invoiceCount?: number;
  canViewCustomerComms?: boolean;
  /** True when this record has no lifetime value (no paid work). */
  isContact?: boolean;
};

export type CustomerPropertyDTO = {
  id: string;
  customerId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  isPrimary: boolean;
  designProjectId: string | null;
  irrigationZoneCount: number | null;
  shutoffValveLocation: string | null;
  controllerLocation: string | null;
  irrigationMapStatus: string | null;
  createdAt: string;
};

export type CustomerListFilters = {
  search?: string;
  city?: string;
  zip?: string;
  leadSource?: string;
  company?: string;
  status?: "ACTIVE" | "ARCHIVED" | "ALL";
  doNotService?: "true" | "false";
  /** Paying customers vs never-paid contacts. Omit to include both. */
  segment?: "CUSTOMERS" | "CONTACTS";
};

export type CustomerPhoneDTO = {
  id: string;
  phone: string;
  note: string | null;
  createdAt: string;
};
