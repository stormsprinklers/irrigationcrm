export const companySettingsSelect = {
  id: true,
  name: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  timezone: true,
  supportEmail: true,
  phone: true,
  website: true,
  legalName: true,
  industry: true,
  description: true,
  emailSenderName: true,
  emailLogoUrl: true,
  invoicePrefix: true,
  invoiceTerms: true,
  invoiceFooter: true,
  onlineBookingEnabled: true,
  bookingSlug: true,
  bookingLeadTimeHours: true,
  portalEnabled: true,
  portalShowInvoices: true,
  portalShowEstimates: true,
  portalShowJobs: true,
  portalSlug: true,
  portalRescheduleLeadHours: true,
  portalCancelLeadHours: true,
  portalAllowSchedule: true,
  portalShowMaintenance: true,
  portalShowChecklists: true,
  portalShowRachio: true,
  portalShowOffers: true,
  portalRachioAllowRun: true,
  notifyEstimateSent: true,
  notifyInvoicePaid: true,
  notifyVisitScheduled: true,
  notifyVisitEnRoute: true,
  notifyVisitTimeUpdated: true,
  notifyVisitCancelled: true,
  notifyVisitCompleted: true,
  notifyReviewRequest: true,
  notifyFeedbackSurvey: true,
  notifyEstimateFollowUp: true,
  googleReviewUrl: true,
  websiteBaseUrl: true,
  arrivalWindowHours: true,
  feedbackSurveyDelayHours: true,
  reviewRequestDelayHours: true,
  estimateFollowUpIntervalDays: true,
  leadSources: true,
  intakeRequiredFields: true,
  businessHours: true,
  referralCode: true,
  subscriptionTier: true,
  customReportPresets: true,
  rachioApiKey: true,
  rachioPersonId: true,
  hydrawiseApiKey: true,
  defaultLeadAssigneeId: true,
  notifyLeadCreated: true,
} as const;

export type CompanySettingsDTO = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  timezone: string | null;
  supportEmail: string | null;
  phone: string | null;
  website: string | null;
  legalName: string | null;
  industry: string | null;
  description: string | null;
  emailSenderName: string | null;
  emailLogoUrl: string | null;
  invoicePrefix: string | null;
  invoiceTerms: string | null;
  invoiceFooter: string | null;
  onlineBookingEnabled: boolean;
  bookingSlug: string | null;
  bookingLeadTimeHours: number;
  portalEnabled: boolean;
  portalShowInvoices: boolean;
  portalShowEstimates: boolean;
  portalShowJobs: boolean;
  portalSlug: string | null;
  portalRescheduleLeadHours: number;
  portalCancelLeadHours: number;
  portalAllowSchedule: boolean;
  portalShowMaintenance: boolean;
  portalShowChecklists: boolean;
  portalShowRachio: boolean;
  portalShowOffers: boolean;
  portalRachioAllowRun: boolean;
  notifyEstimateSent: boolean;
  notifyInvoicePaid: boolean;
  notifyVisitScheduled: boolean;
  notifyVisitEnRoute: boolean;
  notifyVisitTimeUpdated: boolean;
  notifyVisitCancelled: boolean;
  notifyVisitCompleted: boolean;
  notifyReviewRequest: boolean;
  notifyFeedbackSurvey: boolean;
  notifyEstimateFollowUp: boolean;
  googleReviewUrl: string | null;
  websiteBaseUrl: string | null;
  arrivalWindowHours: number;
  feedbackSurveyDelayHours: number;
  reviewRequestDelayHours: number;
  estimateFollowUpIntervalDays: number;
  leadSources: string[];
  intakeRequiredFields: string[];
  businessHours: unknown;
  referralCode: string | null;
  subscriptionTier: string | null;
  customReportPresets: unknown;
  rachioApiKey: string | null;
  rachioPersonId: string | null;
  hydrawiseApiKey: string | null;
  defaultLeadAssigneeId: string | null;
  notifyLeadCreated: boolean;
};

export type BusinessHoursDay = {
  open: boolean;
  start: string;
  end: string;
};

export const DEFAULT_BUSINESS_HOURS: Record<string, BusinessHoursDay> = {
  monday: { open: true, start: "08:00", end: "17:00" },
  tuesday: { open: true, start: "08:00", end: "17:00" },
  wednesday: { open: true, start: "08:00", end: "17:00" },
  thursday: { open: true, start: "08:00", end: "17:00" },
  friday: { open: true, start: "08:00", end: "17:00" },
  saturday: { open: false, start: "09:00", end: "13:00" },
  sunday: { open: false, start: "09:00", end: "13:00" },
};

export const INTAKE_FIELD_OPTIONS = [
  "name",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "zip",
  "companyName",
  "leadSource",
] as const;
