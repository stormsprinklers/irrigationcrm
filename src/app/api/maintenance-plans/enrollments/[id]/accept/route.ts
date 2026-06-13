import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { activateEnrollment } from "@/lib/maintenance-plans/queries";
import { canManageEnrollments } from "@/lib/maintenance-plans/permissions";
import { createEnrollmentSubscription, syncTemplateToStripe } from "@/lib/maintenance-plans/stripe-sync";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEnrollments(user.role as UserRole)) return forbiddenResponse();

    const { id } = await params;
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

    if (process.env.STRIPE_SECRET_KEY && existing.billingFrequency !== "MULTI_YEAR_UPFRONT") {
      await syncTemplateToStripe(existing.templateId);
      const updatedTemplate = await prisma.maintenancePlanTemplate.findUnique({
        where: { id: existing.templateId },
      });
      const priceIds = (updatedTemplate?.stripePriceIds as Record<string, string> | null) ?? {};
      const priceId = priceIds[existing.billingFrequency];

      let stripeCustomerId = existing.customer.stripeCustomerId ?? existing.stripeCustomerId;
      if (!stripeCustomerId) {
        const { getStripeClient } = await import("@/lib/stripe/client");
        const customer = await getStripeClient().customers.create({
          email: existing.customer.email ?? undefined,
          name: existing.customer.name,
          phone: existing.customer.phone ?? undefined,
          metadata: { customerId: existing.customer.id, companyId: user.companyId },
        });
        stripeCustomerId = customer.id;
        await prisma.customer.update({
          where: { id: existing.customerId },
          data: { stripeCustomerId },
        });
      }

      if (priceId && stripeCustomerId) {
        const subscription = await createEnrollmentSubscription({
          enrollmentId: id,
          stripeCustomerId,
          priceId,
          paymentMethodId: existing.stripePaymentMethodId ?? undefined,
        });
        await prisma.maintenancePlanEnrollment.update({
          where: { id },
          data: {
            stripeCustomerId,
            stripeSubscriptionId: subscription.id,
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
