import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import {
  getOrCreateReferralProgramSettings,
  updateReferralProgramSettings,
} from "@/lib/referrals/settings";
import { getCompanyConnectStatus } from "@/lib/referrals/stripe-connect";
import { parseDollarsToCents } from "@/lib/referrals/utils";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const settings = await getOrCreateReferralProgramSettings(user.companyId);
    const connect = await getCompanyConnectStatus(user.companyId);

    return NextResponse.json({
      enabled: settings.enabled,
      installRewardCents: settings.installRewardCents,
      serviceRewardCents: settings.serviceRewardCents,
      autoEnrollCustomers: settings.autoEnrollCustomers,
      headline: settings.headline,
      terms: settings.terms,
      stripeConnect: connect,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const data: Parameters<typeof updateReferralProgramSettings>[1] = {};

    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
    if (body.autoEnrollCustomers !== undefined) {
      data.autoEnrollCustomers = Boolean(body.autoEnrollCustomers);
    }
    if (body.headline !== undefined) {
      data.headline = typeof body.headline === "string" ? body.headline.trim() || null : null;
    }
    if (body.terms !== undefined) {
      data.terms = typeof body.terms === "string" ? body.terms.trim() || null : null;
    }

    if (body.installRewardDollars !== undefined) {
      const cents = parseDollarsToCents(body.installRewardDollars);
      if (cents == null) {
        return NextResponse.json({ error: "Invalid install reward amount" }, { status: 400 });
      }
      data.installRewardCents = cents;
    }
    if (body.serviceRewardDollars !== undefined) {
      const cents = parseDollarsToCents(body.serviceRewardDollars);
      if (cents == null) {
        return NextResponse.json({ error: "Invalid service reward amount" }, { status: 400 });
      }
      data.serviceRewardCents = cents;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    const settings = await updateReferralProgramSettings(user.companyId, data);
    const connect = await getCompanyConnectStatus(user.companyId);

    return NextResponse.json({
      enabled: settings.enabled,
      installRewardCents: settings.installRewardCents,
      serviceRewardCents: settings.serviceRewardCents,
      autoEnrollCustomers: settings.autoEnrollCustomers,
      headline: settings.headline,
      terms: settings.terms,
      stripeConnect: connect,
    });
  } catch {
    return unauthorizedResponse();
  }
}
