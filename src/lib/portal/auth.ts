import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalSession, type PortalSessionPayload } from "./session";
import type { PortalCompany } from "./company";

export type PortalCustomerContext = PortalSessionPayload & {
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    doNotService: boolean;
  };
  company: PortalCompany;
};

export async function requirePortalCustomer(): Promise<PortalCustomerContext | null> {
  const session = await getPortalSession();
  if (!session) return null;

  const [customer, company] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: session.customerId, companyId: session.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        doNotService: true,
        status: true,
      },
    }),
    prisma.company.findUnique({
      where: { id: session.companyId },
      select: {
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
        portalRachioAllowRun: true,
      },
    }),
  ]);

  if (!customer || customer.status !== "ACTIVE" || !company?.portalEnabled) {
    return null;
  }

  return {
    ...session,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      doNotService: customer.doNotService,
    },
    company,
  };
}

export function portalUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function portalForbiddenResponse(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function portalNotFoundResponse() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
