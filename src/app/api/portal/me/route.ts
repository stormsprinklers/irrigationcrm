import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalCustomer, portalUnauthorizedResponse } from "@/lib/portal/auth";
import { serializePortalProperty } from "@/lib/portal/serializers";
import { portalFeatureEnabled } from "@/lib/portal/permissions";

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
        rachio: portalFeatureEnabled(ctx.company, "rachio"),
        offers: portalFeatureEnabled(ctx.company, "offers"),
        allowSchedule: ctx.company.portalAllowSchedule,
        rachioAllowRun: ctx.company.portalRachioAllowRun,
      },
    },
  });
}
