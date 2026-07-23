import type {
  BillingFrequency,
  BillingPeriodStatus,
  CancellationFeeType,
  EnrollmentStatus,
  PlanDiscountAppliesTo,
  PlanDurationType,
  PlanVisitSeason,
  PlanVisitStatus,
} from "@prisma/client";

export type MaintenancePlanTemplateDTO = {
  id: string;
  name: string;
  description: string | null;
  termsText: string | null;
  termsHtml: string | null;
  basePrice: number;
  active: boolean;
  durationType: PlanDurationType;
  durationYears: number | null;
  allowedBillingFrequencies: BillingFrequency[];
  autoRenewDefault: boolean;
  cancellationFeeType: CancellationFeeType;
  cancellationFeeAmount: number | null;
  cancellationNoticeDays: number;
  benefits: string[];
  stripeProductId: string | null;
  visitTemplates: VisitTemplateDTO[];
  addons: AddonDTO[];
  discounts: PlanDiscountDTO[];
  enrollmentCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type VisitTemplateDTO = {
  id: string;
  name: string;
  season: PlanVisitSeason;
  defaultMonth: number;
  visitTitle: string;
  description: string | null;
  estimatedMinutes: number;
  sortOrder: number;
};

export type AddonDTO = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  sortOrder: number;
};

export type PlanDiscountDTO = {
  id: string;
  label: string | null;
  type: "PERCENT" | "FIXED";
  amount: number;
  appliesTo: PlanDiscountAppliesTo;
};

export type EnrollmentDTO = {
  id: string;
  status: EnrollmentStatus;
  billingFrequency: BillingFrequency;
  startDate: string;
  endDate: string | null;
  nextBillingDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  acceptedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    doNotService: boolean;
  };
  property: { id: string; name: string; address: string | null };
  template: {
    id: string;
    name: string;
    basePrice: number;
    cancellationFeeType: CancellationFeeType;
    cancellationFeeAmount: number | null;
  };
  cancellationFeeCharged?: number | null;
  planVisits?: PlanVisitDTO[];
  billingPeriods?: BillingPeriodDTO[];
};

export type PlanVisitDTO = {
  id: string;
  dueYear: number;
  dueMonth: number;
  status: PlanVisitStatus;
  completedAt: string | null;
  visitTemplate: VisitTemplateDTO | null;
  visit: { id: string; title: string; startAt: string } | null;
};

export type BillingPeriodDTO = {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: BillingPeriodStatus;
  dueDate: string;
  paidAt: string | null;
  invoiceId: string | null;
};

export type DashboardDTO = {
  summary: {
    totalEnrollments: number;
    revenueAllTime: number;
    statuses: Array<{ status: EnrollmentStatus; count: number }>;
  };
  recurringRevenue: Array<{ month: string; amount: number }>;
  revenueCollectedThisMonth: number;
  revenueTrendPercent: number | null;
  unscheduledVisitCount: number;
  dueBillingCount: number;
  templates: Array<{ id: string; name: string; basePrice: number; active: boolean }>;
};
