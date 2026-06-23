import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalInvoice } from "@/lib/portal/serializers";

export async function GET() {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();
  if (!portalFeatureEnabled(ctx.company, "invoices")) {
    return portalForbiddenResponse("Invoices are not available in the portal");
  }

  const invoices = await prisma.invoice.findMany({
    where: { companyId: ctx.companyId, customerId: ctx.customerId },
    include: { payments: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    invoices: invoices.map(serializePortalInvoice),
  });
}
