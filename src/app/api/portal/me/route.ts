import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalCustomer, portalUnauthorizedResponse } from "@/lib/portal/auth";
import { serializePortalProperty } from "@/lib/portal/serializers";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { listPortalOffersForCustomer } from "@/lib/portal/offers";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();

  const customer = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      tags: true,
      properties: {
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          isPrimary: true,
          propertyDiagramUrl: true,
        },
      },
    },
  });

  if (!customer) return portalUnauthorizedResponse();

  const [availableOffers, referralSettings] = await Promise.all([
    portalFeatureEnabled(ctx.company, "offers")
      ? listPortalOffersForCustomer(ctx.companyId, {
          tags: customer.tags,
          zip: customer.zip,
        })
      : Promise.resolve([]),
    portalFeatureEnabled(ctx.company, "referrals")
      ? prisma.referralProgramSettings.findUnique({
          where: { companyId: ctx.companyId },
          select: { enabled: true },
        })
      : Promise.resolve(null),
  ]);

  const showOffers = availableOffers.length > 0;
  const showReferrals = Boolean(referralSettings?.enabled);

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
    },
    properties: customer.properties.map(serializePortalProperty),
    company: {
      name: ctx.company.name,
      phone: ctx.company.phone,
      supportEmail: ctx.company.supportEmail,
      emailLogoUrl: ctx.company.emailLogoUrl,
      features: {
        jobs: portalFeatureEnabled(ctx.company, "jobs"),
        invoices: portalFeatureEnabled(ctx.company, "invoices"),
        estimates: portalFeatureEnabled(ctx.company, "estimates"),
        maintenance: portalFeatureEnabled(ctx.company, "maintenance"),
        checklists: portalFeatureEnabled(ctx.company, "checklists"),
        irrigation: portalFeatureEnabled(ctx.company, "irrigation"),
        rachio: portalFeatureEnabled(ctx.company, "rachio"),
        offers: showOffers,
        referrals: showReferrals,
        allowSchedule: ctx.company.portalAllowSchedule,
        rachioAllowRun:
          portalFeatureEnabled(ctx.company, "rachio") && ctx.company.portalRachioAllowRun,
      },
    },
  });
}
