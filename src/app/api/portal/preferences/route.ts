import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  prefsAllOptedOut,
  verifyMessagingPreferencesToken,
} from "@/lib/marketing/unsubscribe";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const verified = verifyMessagingPreferencesToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: verified.customerId, companyId: verified.companyId },
    select: {
      id: true,
      name: true,
      marketingEmailOptOut: true,
      marketingSmsOptOut: true,
      appointmentReminderEmailOptOut: true,
      appointmentReminderSmsOptOut: true,
      doNotService: true,
      company: { select: { name: true, emailLogoUrl: true } },
    },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json({
    customerName: customer.name,
    companyName: customer.company.name,
    emailLogoUrl: customer.company.emailLogoUrl,
    preferences: {
      marketingEmail: !customer.marketingEmailOptOut,
      marketingSms: !customer.marketingSmsOptOut,
      appointmentReminderEmail: !customer.appointmentReminderEmailOptOut,
      appointmentReminderSms: !customer.appointmentReminderSmsOptOut,
    },
    doNotService: customer.doNotService,
  });
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const verified = verifyMessagingPreferencesToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    marketingEmail?: boolean;
    marketingSms?: boolean;
    appointmentReminderEmail?: boolean;
    appointmentReminderSms?: boolean;
    confirmDoNotService?: boolean;
  };

  const marketingEmailOptOut = body.marketingEmail === false;
  const marketingSmsOptOut = body.marketingSms === false;
  const appointmentReminderEmailOptOut = body.appointmentReminderEmail === false;
  const appointmentReminderSmsOptOut = body.appointmentReminderSms === false;

  const allOff = prefsAllOptedOut({
    marketingEmailOptOut,
    marketingSmsOptOut,
    appointmentReminderEmailOptOut,
    appointmentReminderSmsOptOut,
  });

  if (allOff && !body.confirmDoNotService) {
    return NextResponse.json(
      {
        error: "confirm_do_not_service",
        message:
          "Turning off all messaging marks your account as Do Not Service — we will not return to your property. Confirm to continue.",
      },
      { status: 409 }
    );
  }

  const anyOn = !allOff;
  const data = {
    marketingEmailOptOut,
    marketingSmsOptOut,
    appointmentReminderEmailOptOut,
    appointmentReminderSmsOptOut,
    ...(allOff && body.confirmDoNotService ? { doNotService: true } : {}),
    ...(anyOn ? { doNotService: false } : {}),
  };

  const customer = await prisma.customer.updateMany({
    where: { id: verified.customerId, companyId: verified.companyId },
    data,
  });
  if (customer.count === 0) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (marketingEmailOptOut) {
    await prisma.campaignEnrollment.updateMany({
      where: {
        customerId: verified.customerId,
        status: "ACTIVE",
        campaign: { companyId: verified.companyId, type: "DRIP", channel: "EMAIL" },
      },
      data: { status: "CANCELLED" },
    });
  }
  if (marketingSmsOptOut) {
    await prisma.campaignEnrollment.updateMany({
      where: {
        customerId: verified.customerId,
        status: "ACTIVE",
        campaign: { companyId: verified.companyId, type: "DRIP", channel: "SMS" },
      },
      data: { status: "CANCELLED" },
    });
  }

  return NextResponse.json({
    ok: true,
    doNotService: allOff && Boolean(body.confirmDoNotService),
    preferences: {
      marketingEmail: !marketingEmailOptOut,
      marketingSms: !marketingSmsOptOut,
      appointmentReminderEmail: !appointmentReminderEmailOptOut,
      appointmentReminderSms: !appointmentReminderSmsOptOut,
    },
  });
}
