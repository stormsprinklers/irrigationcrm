import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api-auth";
import { getGoogleMapsApiKey } from "@/lib/customers/maps";
import { prisma } from "@/lib/prisma";
import { requirePortalCustomer, portalNotFoundResponse } from "@/lib/portal/auth";
import {
  findEstimateByPublicToken,
  findEstimateForStaffPreview,
} from "@/lib/portal/public-estimate";
import { verifyEstimatePreviewToken } from "@/lib/portal/estimate-preview";

type Params = { params: Promise<{ id: string }> };

function isHolidayEstimate(metadata: unknown) {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).source === "holiday-lighting-quote"
  );
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const previewToken = request.nextUrl.searchParams.get("previewToken");
  let estimate: { designExportMetadata: unknown } | null = null;

  if (previewToken) {
    const preview = verifyEstimatePreviewToken(previewToken);
    if (preview) {
      const candidate = await findEstimateForStaffPreview(preview.companyId, id);
      if (candidate?.id === preview.estimateId) estimate = candidate;
    }
  }

  if (!estimate) {
    const ctx = await requirePortalCustomer();
    if (ctx) {
      estimate = await prisma.estimate.findFirst({
        where: {
          companyId: ctx.companyId,
          customerId: ctx.customerId,
          OR: [{ id }, { publicToken: id }],
          status: { not: "DRAFT" },
        },
        select: { designExportMetadata: true },
      });
    }
  }

  if (!estimate) {
    const staff = await getSessionUser(request);
    if (staff) estimate = await findEstimateForStaffPreview(staff.companyId, id);
  }

  if (!estimate) estimate = await findEstimateByPublicToken(id);
  if (!estimate || !isHolidayEstimate(estimate.designExportMetadata)) {
    return portalNotFoundResponse();
  }

  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() ||
    getGoogleMapsApiKey().trim();
  if (!key) {
    return NextResponse.json({ error: "Satellite plans are not configured" }, { status: 503 });
  }

  return NextResponse.json(
    { key },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
