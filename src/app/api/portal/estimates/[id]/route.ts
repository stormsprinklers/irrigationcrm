import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/api-auth";
import {
  requirePortalCustomer,
  portalForbiddenResponse,
  portalNotFoundResponse,
} from "@/lib/portal/auth";
import { portalFeatureEnabled } from "@/lib/portal/permissions";
import { serializePortalEstimate } from "@/lib/portal/serializers";
import {
  findEstimateByPublicToken,
  findEstimateForStaffPreview,
  portalCompanyPayload,
} from "@/lib/portal/public-estimate";
import { createEstimateVslGate } from "@/lib/portal/estimate-vsl";
import { getCustomerBaseUrl } from "@/lib/company/customer-url";
import { verifyEstimatePreviewToken } from "@/lib/portal/estimate-preview";
import { buildHolidaySubscriptionAgreement } from "@/lib/holiday-lighting/subscription-agreement";

type Params = { params: Promise<{ id: string }> };

async function loadEstimate(companyId: string, customerId: string, idOrToken: string) {
  return prisma.estimate.findFirst({
    where: {
      companyId,
      customerId,
      OR: [{ id: idOrToken }, { publicToken: idOrToken }],
      status: { not: "DRAFT" },
    },
    include: {
      customer: {
        select: {
          estimateVslViewedAt: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          zip: true,
        },
      },
      property: {
        select: { address: true, city: true, state: true, zip: true },
      },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { priceBookItem: { select: { type: true } } },
      },
      options: { orderBy: { sortOrder: "asc" } },
      discounts: true,
      visit: {
        select: {
          id: true,
          title: true,
          startAt: true,
          endAt: true,
          assignedUser: { select: { name: true, photoUrl: true, title: true } },
        },
      },
      company: {
        select: {
          estimateWarrantyText: true,
          deferredVisitDepositThreshold: true,
        },
      },
    },
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (process.env.NODE_ENV === "development" && id === "sample") {
    const optionId = "sample-seasonal-option";
    const optionMetadata = {
      pricingMode: "buy",
      recurringYearlyService: true,
      cancellationFee: 812.5,
      cancellationItems: [
        { id: "sample-c9", name: "C9 LED bulbs", quantity: 125, unitMsrp: 4.5, total: 562.5 },
        { id: "sample-timer", name: "Outdoor timer", quantity: 1, unitMsrp: 250, total: 250 },
      ],
    };
    const lineItems = [
      { optionId, name: "Roofline", description: "C9 · Multicolor", quantity: 1, unitPrice: 1300, unit: "each", total: 1300 },
      { optionId, name: "36-inch wreath", description: "Artificial and pre-lit.", quantity: 1, unitPrice: 298, unit: "each", total: 298 },
      { optionId, name: "Lifetime warranty", description: "Included with yearly service.", quantity: 1, unitPrice: 0, unit: "included", total: 0 },
    ];
    return NextResponse.json({
      authenticated: false,
      staffPreview: false,
      company: {
        name: "Chestnut & Cheer",
        emailLogoUrl: null,
        phone: "385-999-6887",
        supportEmail: "hello@utah.christmas",
        estimateWarrantyText: null,
        financingUrl: null,
        termsOfServiceUrl: null,
        privacyPolicyUrl: null,
        features: { jobs: false, invoices: false, estimates: true, maintenance: false, checklists: false, irrigation: false, rachio: false, offers: false, referrals: false, allowSchedule: false, rachioAllowRun: false },
      },
      estimate: {
        id: "sample-estimate",
        estimateNumber: "EST-SAMPLE",
        publicToken: "sample",
        status: "SENT",
        selectedOptionId: optionId,
        subtotal: 1598,
        discountTotal: 0,
        total: 1598,
        expiresAt: null,
        signedAt: null,
        depositRequired: true,
        depositType: "PERCENT",
        depositAmount: 50,
        depositThreshold: 999,
        depositPaidAt: null,
        needsScheduling: false,
        hasDesign: false,
        hasHolidayLighting: true,
        holidayRecurringService: true,
        holidayPreviewImageUrl: null,
        holidayPreviewDisclaimer: null,
        premiumOptionTotal: null,
        warrantyText: null,
        options: [{
          id: optionId,
          letter: "A",
          label: "Classic Roofline",
          displayNumber: "EST-SAMPLE",
          description: "Yearly recurring holiday lighting service with C9 Multicolor lights.",
          photoUrl: null,
          declinedAt: null,
          sortOrder: 0,
          popular: false,
          pricingMode: "buy",
          recurringYearlyService: true,
          cancellationFee: 812.5,
          leaseContractYears: null,
          subtotal: 1598,
          discountTotal: 0,
          total: 1598,
          subscriptionAgreement: buildHolidaySubscriptionAgreement({
            estimateNumber: "EST-SAMPLE",
            selectedOptionId: optionId,
            optionLabel: "Classic Roofline",
            optionTotal: 1598,
            optionMetadata,
            lineItems,
            customer: { name: "Jordan Sample", email: "jordan@example.com", phone: "801-555-0147" },
            property: { address: "124 Maple Lane", city: "Orem", state: "UT", zip: "84057" },
            createdAt: new Date("2026-11-06T12:00:00.000Z"),
          }),
        }],
        lineItems,
        discounts: [],
        visit: null,
      },
    });
  }
  const continueAfterVsl = request.nextUrl.searchParams.get("continueAfterVsl") === "1";
  const previewToken = request.nextUrl.searchParams.get("previewToken");

  if (previewToken) {
    const preview = verifyEstimatePreviewToken(previewToken);
    if (preview) {
      const estimate = await findEstimateForStaffPreview(preview.companyId, id);
      if (estimate?.id === preview.estimateId) {
        return NextResponse.json({
          estimate: serializePortalEstimate(
            estimate,
            getCustomerBaseUrl(estimate.company)
          ),
          company: portalCompanyPayload(estimate.company),
          authenticated: false,
          staffPreview: true,
        });
      }
    }
  }

  const ctx = await requirePortalCustomer();

  if (ctx) {
    if (!portalFeatureEnabled(ctx.company, "estimates")) {
      return portalForbiddenResponse("Estimates are not available in the portal");
    }
    const estimate = await loadEstimate(ctx.companyId, ctx.customerId, id);
    if (!estimate) return portalNotFoundResponse();
    const vslGate =
      continueAfterVsl && estimate.customer.estimateVslViewedAt
        ? null
        : await createEstimateVslGate({
            company: ctx.company,
            customerId: ctx.customerId,
            estimateId: estimate.id,
            viewedAt: estimate.customer.estimateVslViewedAt,
          });
    if (vslGate) {
      return NextResponse.json({
        vslGate,
        company: portalCompanyPayload(ctx.company),
        authenticated: true,
      });
    }
    return NextResponse.json({
      estimate: serializePortalEstimate(estimate, getCustomerBaseUrl(ctx.company)),
      company: portalCompanyPayload(ctx.company),
      authenticated: true,
    });
  }

  // The staff send dialog opens the branded customer view while the estimate
  // is still a draft. Keep that preview private to a signed-in company user.
  const staff = await getSessionUser(request);
  if (staff) {
    const estimate = await findEstimateForStaffPreview(staff.companyId, id);
    if (estimate) {
      return NextResponse.json({
        estimate: serializePortalEstimate(
          estimate,
          getCustomerBaseUrl(estimate.company)
        ),
        company: portalCompanyPayload(estimate.company),
        authenticated: false,
        staffPreview: true,
      });
    }
  }

  // Unauthenticated: estimate link from SMS/email uses publicToken only.
  const estimate = await findEstimateByPublicToken(id);
  if (!estimate) return portalNotFoundResponse();

  const vslGate =
    continueAfterVsl && estimate.customer.estimateVslViewedAt
      ? null
      : await createEstimateVslGate({
          company: estimate.company,
          customerId: estimate.customerId,
          estimateId: estimate.id,
          viewedAt: estimate.customer.estimateVslViewedAt,
        });
  if (vslGate) {
    return NextResponse.json({
      vslGate,
      company: portalCompanyPayload(estimate.company),
      authenticated: false,
    });
  }

  return NextResponse.json({
    estimate: serializePortalEstimate(
      estimate,
      getCustomerBaseUrl(estimate.company)
    ),
    company: portalCompanyPayload(estimate.company),
    authenticated: false,
  });
}
