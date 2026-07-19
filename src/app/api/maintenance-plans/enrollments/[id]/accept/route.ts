import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getAppBaseUrl } from "@/lib/app-url";
import { requireCardOnFileOrSetupUrl } from "@/lib/customers/stripe";
import { activateEnrollment } from "@/lib/maintenance-plans/queries";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";
import { createEnrollmentSubscription, syncTemplateToStripe } from "@/lib/maintenance-plans/stripe-sync";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      mobileReturn?: boolean;
      platform?: string;
    };
    const mobileReturn = body.mobileReturn === true || body.platform === "ios";

    const existing = await prisma.maintenancePlanEnrollment.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        customer: true,
        template: true,
      },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "DRAFT" && existing.status !== "SENT") {
      return badRequestResponse("Only draft or sent enrollments can be accepted");
    }

    const appUrl = getAppBaseUrl(request.nextUrl.origin);
    const cardCheck = await requireCardOnFileOrSetupUrl({
      customerId: existing.customerId,
      companyId: user.companyId,
      appUrl,
      mobileReturn,
      enrollmentId: id,
      successUrl: mobileReturn
        ? undefined
        : `${appUrl}/maintenance-plans/enrollments/${id}?cardSetup=success`,
      cancelUrl: mobileReturn
        ? undefined
        : `${appUrl}/maintenance-plans/enrollments/${id}?cardSetup=cancelled`,
    });

    if (!cardCheck.ok) {
      return NextResponse.json(
        {
          error: cardCheck.error,
          code: cardCheck.code,
          setupUrl: cardCheck.setupUrl || null,
          customerId: existing.customerId,
          enrollmentId: id,
        },
        { status: 409 }
      );
    }

    await prisma.maintenancePlanEnrollment.update({
      where: { id },
      data: {
        stripeCustomerId: cardCheck.stripeCustomerId,
        stripePaymentMethodId: cardCheck.paymentMethodId,
      },
    });

    if (process.env.STRIPE_SECRET_KEY && existing.billingFrequency !== "MULTI_YEAR_UPFRONT") {
      await syncTemplateToStripe(existing.templateId);
      const updatedTemplate = await prisma.maintenancePlanTemplate.findUnique({
        where: { id: existing.templateId },
      });
      const priceIds = (updatedTemplate?.stripePriceIds as Record<string, string> | null) ?? {};
      const priceId = priceIds[existing.billingFrequency];

      if (priceId) {
        const subscription = await createEnrollmentSubscription({
          enrollmentId: id,
          stripeCustomerId: cardCheck.stripeCustomerId,
          priceId,
          paymentMethodId: cardCheck.paymentMethodId,
        });
        await prisma.maintenancePlanEnrollment.update({
          where: { id },
          data: {
            stripeCustomerId: cardCheck.stripeCustomerId,
            stripeSubscriptionId: subscription.id,
            stripePaymentMethodId: cardCheck.paymentMethodId,
          },
        });
      }
    }

    const enrollment = await activateEnrollment(user.companyId, id);
    if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(enrollment);
  } catch {
    return unauthorizedResponse();
  }
}
