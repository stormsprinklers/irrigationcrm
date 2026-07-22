import { NextRequest, NextResponse } from "next/server";
import { ExpenseCardStatus } from "@prisma/client";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { verifyExpenseCardActionToken } from "@/lib/expense-cards/action-token";
import { resolveEffectiveControls } from "@/lib/expense-cards/controls";
import { prisma } from "@/lib/prisma";
import {
  createIssuingCardholder,
  createVirtualIssuingCard,
} from "@/lib/stripe/issuing/cards";

function requireMfaToken(request: NextRequest, body: Record<string, unknown>) {
  return (
    (typeof body.actionToken === "string" && body.actionToken) ||
    request.headers.get("x-expense-card-mfa")?.trim() ||
    ""
  );
}

/** Manually issue a virtual Stripe Issuing card for one employee. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN") return forbiddenResponse();

    const body = (await request.json()) as Record<string, unknown>;
    const token = requireMfaToken(request, body);
    const mfa = await verifyExpenseCardActionToken(token, {
      userId: user.id,
      companyId: user.companyId,
    });
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.error }, { status: 401 });
    }

    const employeeId = String(body.userId ?? "").trim();
    if (!employeeId) return badRequestResponse("userId is required");

    const existing = await prisma.expenseCard.findUnique({
      where: { userId: employeeId },
    });
    if (existing && existing.companyId !== user.companyId) {
      return badRequestResponse("Employee not found");
    }
    if (existing && existing.status !== ExpenseCardStatus.CANCELED) {
      return badRequestResponse("This employee already has an expense card");
    }

    const [company, employee] = await Promise.all([
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: {
          expenseCardsEnabled: true,
          expenseCardDefaultsJson: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zip: true,
        },
      }),
      prisma.user.findFirst({
        where: {
          id: employeeId,
          companyId: user.companyId,
          status: "ACTIVE",
          systemKind: null,
        },
      }),
    ]);

    if (!company?.expenseCardsEnabled) {
      return badRequestResponse("Enable Company Expense Cards before issuing cards");
    }
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const line1 = String(body.billingLine1 ?? company.address ?? "").trim();
    const city = String(body.billingCity ?? company.city ?? "").trim();
    const state = String(body.billingState ?? company.state ?? "").trim();
    const postal = String(body.billingPostal ?? company.zip ?? "").trim();
    if (!line1 || !city || !state || !postal) {
      return badRequestResponse(
        "Billing address is required (company address or provide billingLine1/city/state/postal)"
      );
    }

    const rolePolicy = await prisma.expenseCardRolePolicy.findUnique({
      where: {
        companyId_role: { companyId: user.companyId, role: employee.role },
      },
    });

    const override = {
      dailyLimitCents:
        typeof body.dailyLimitCents === "number" ? body.dailyLimitCents : null,
      monthlyLimitCents:
        typeof body.monthlyLimitCents === "number" ? body.monthlyLimitCents : null,
      blockAtm: typeof body.blockAtm === "boolean" ? body.blockAtm : null,
      blockInternational:
        typeof body.blockInternational === "boolean" ? body.blockInternational : null,
      blockOnline: typeof body.blockOnline === "boolean" ? body.blockOnline : null,
      allowedCategories: Array.isArray(body.allowedCategories)
        ? (body.allowedCategories as string[])
        : [],
    };

    const controls = resolveEffectiveControls({
      companyDefaults: company.expenseCardDefaultsJson,
      rolePolicy,
      card: override,
    });

    const encryptedPin =
      typeof body.encryptedPin === "string" && body.encryptedPin.trim()
        ? body.encryptedPin.trim()
        : null;

    let cardholderId = existing?.stripeCardholderId;
    if (!cardholderId) {
      const cardholder = await createIssuingCardholder({
        userId: employee.id,
        companyId: user.companyId,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        billing: {
          line1,
          city,
          state,
          postal_code: postal,
        },
      });
      cardholderId = cardholder.id;
    }

    const stripeCard = await createVirtualIssuingCard({
      cardholderId,
      companyId: user.companyId,
      userId: employee.id,
      controls,
      encryptedPin,
    });

    const card = existing
      ? await prisma.expenseCard.update({
          where: { id: existing.id },
          data: {
            stripeCardholderId: cardholderId,
            stripeCardId: stripeCard.id,
            status: ExpenseCardStatus.ACTIVE,
            last4: stripeCard.last4,
            dailyLimitCents: override.dailyLimitCents,
            monthlyLimitCents: override.monthlyLimitCents,
            blockAtm: override.blockAtm,
            blockInternational: override.blockInternational,
            blockOnline: override.blockOnline,
            allowedCategories: override.allowedCategories,
            createdByUserId: user.id,
          },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        })
      : await prisma.expenseCard.create({
          data: {
            companyId: user.companyId,
            userId: employee.id,
            stripeCardholderId: cardholderId,
            stripeCardId: stripeCard.id,
            status: ExpenseCardStatus.ACTIVE,
            last4: stripeCard.last4,
            dailyLimitCents: override.dailyLimitCents,
            monthlyLimitCents: override.monthlyLimitCents,
            blockAtm: override.blockAtm,
            blockInternational: override.blockInternational,
            blockOnline: override.blockOnline,
            allowedCategories: override.allowedCategories,
            createdByUserId: user.id,
          },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        });

    return NextResponse.json({
      card,
      effectiveControls: controls,
      // PIN is never returned from Stripe; admin showed it once client-side before encrypting.
    });
  } catch (error) {
    console.error("[expense-cards] issue failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to issue expense card";
    if (message.includes("STRIPE_SECRET_KEY")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
