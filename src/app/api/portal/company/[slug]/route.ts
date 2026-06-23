import { NextRequest, NextResponse } from "next/server";
import { getCompanyByPortalSlug } from "@/lib/portal/company";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const company = await getCompanyByPortalSlug(slug);
  if (!company) {
    return NextResponse.json({ error: "Portal not available" }, { status: 404 });
  }

  return NextResponse.json({
    company: {
      name: company.name,
      phone: company.phone,
      supportEmail: company.supportEmail,
      description: company.description,
      emailLogoUrl: company.emailLogoUrl,
      portalShowJobs: company.portalShowJobs,
      portalShowInvoices: company.portalShowInvoices,
      portalShowEstimates: company.portalShowEstimates,
      portalShowMaintenance: company.portalShowMaintenance,
      portalShowChecklists: company.portalShowChecklists,
      portalShowRachio: company.portalShowRachio,
      portalShowOffers: company.portalShowOffers,
      portalAllowSchedule: company.portalAllowSchedule,
    },
  });
}
