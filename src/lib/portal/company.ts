import { prisma } from "@/lib/prisma";

export const portalCompanySelect = {
  id: true,
  name: true,
  phone: true,
  supportEmail: true,
  website: true,
  description: true,
  emailLogoUrl: true,
  sendgridFrom: true,
  emailSenderName: true,
  timezone: true,
  businessHours: true,
  bookingSlug: true,
  bookingLeadTimeHours: true,
  portalEnabled: true,
  portalSlug: true,
  portalShowInvoices: true,
  portalShowEstimates: true,
  portalShowJobs: true,
  portalRescheduleLeadHours: true,
  portalCancelLeadHours: true,
  portalAllowSchedule: true,
  portalShowMaintenance: true,
  portalShowChecklists: true,
  portalShowRachio: true,
  portalShowOffers: true,
  portalShowReferrals: true,
  portalRachioAllowRun: true,
  estimateWarrantyText: true,
} as const;

export type PortalCompany = {
  id: string;
  name: string;
  phone: string | null;
  supportEmail: string | null;
  website: string | null;
  description: string | null;
  emailLogoUrl: string | null;
  sendgridFrom: string | null;
  emailSenderName: string | null;
  timezone: string | null;
  businessHours: unknown;
  bookingSlug: string | null;
  bookingLeadTimeHours: number;
  portalEnabled: boolean;
  portalSlug: string | null;
  portalShowInvoices: boolean;
  portalShowEstimates: boolean;
  portalShowJobs: boolean;
  portalRescheduleLeadHours: number;
  portalCancelLeadHours: number;
  portalAllowSchedule: boolean;
  portalShowMaintenance: boolean;
  portalShowChecklists: boolean;
  portalShowRachio: boolean;
  portalShowOffers: boolean;
  portalShowReferrals: boolean;
  portalRachioAllowRun: boolean;
  estimateWarrantyText: string | null;
};

export function resolvePortalSlug(company: { portalSlug: string | null; bookingSlug: string | null }) {
  return company.portalSlug ?? company.bookingSlug;
}

export async function getCompanyByPortalSlug(slug: string) {
  const company = await prisma.company.findFirst({
    where: {
      portalEnabled: true,
      OR: [{ portalSlug: slug }, { bookingSlug: slug }],
    },
    select: portalCompanySelect,
  });
  return company;
}

export async function getPortalCompanyOrThrow(slug: string) {
  const company = await getCompanyByPortalSlug(slug);
  if (!company) return null;
  return company;
}
