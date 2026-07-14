import { NextRequest, NextResponse } from "next/server";
import { AppNotificationType } from "@prisma/client";
import { addMinutes } from "date-fns";
import {
  getHiringManagerSlots,
  HIRING_SCREEN_MINUTES,
  resolveHiringManagerForJob,
} from "@/lib/hiring/availability";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string }> };

async function loadApplicantByToken(token: string) {
  return prisma.jobApplicant.findFirst({
    where: { bookingToken: token },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          phone: true,
          supportEmail: true,
          timezone: true,
          sendgridFrom: true,
          emailSenderName: true,
          emailLogoUrl: true,
        },
      },
      bookings: {
        where: { status: "SCHEDULED" },
        orderBy: { startAt: "asc" },
        take: 1,
      },
    },
  });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const applicant = await loadApplicantByToken(token);
  if (!applicant) {
    return NextResponse.json({ error: "Booking link not found" }, { status: 404 });
  }

  if (applicant.stage === "REJECTED") {
    return NextResponse.json({ error: "This application is no longer active" }, { status: 410 });
  }

  const manager = await resolveHiringManagerForJob(applicant.companyId, applicant.jobSlug);
  if (!manager) {
    return NextResponse.json(
      { error: "Scheduling is not available yet. Please try again later." },
      { status: 503 }
    );
  }

  const existing = applicant.bookings[0] ?? null;
  const slots = existing
    ? []
    : await getHiringManagerSlots({
        companyId: applicant.companyId,
        managerUserId: manager.id,
      });

  return NextResponse.json({
    company: {
      name: applicant.company.name,
      phone: applicant.company.phone,
      supportEmail: applicant.company.supportEmail,
      timezone: applicant.company.timezone,
    },
    applicant: {
      name: applicant.name,
      jobTitle: applicant.jobTitle || applicant.jobSlug,
    },
    managerName: manager.name,
    existingBooking: existing
      ? {
          startAt: existing.startAt.toISOString(),
          endAt: existing.endAt.toISOString(),
        }
      : null,
    slots,
    slotMinutes: HIRING_SCREEN_MINUTES,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const applicant = await loadApplicantByToken(token);
  if (!applicant) {
    return NextResponse.json({ error: "Booking link not found" }, { status: 404 });
  }
  if (applicant.stage === "REJECTED") {
    return NextResponse.json({ error: "This application is no longer active" }, { status: 410 });
  }

  const existing = applicant.bookings[0];
  if (existing) {
    return NextResponse.json({
      ok: true,
      booking: {
        startAt: existing.startAt.toISOString(),
        endAt: existing.endAt.toISOString(),
      },
    });
  }

  const body = await request.json();
  const startAt = body.startAt ? new Date(String(body.startAt)) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "startAt is required" }, { status: 400 });
  }

  const manager = await resolveHiringManagerForJob(applicant.companyId, applicant.jobSlug);
  if (!manager) {
    return NextResponse.json({ error: "No hiring manager available" }, { status: 503 });
  }

  const slots = await getHiringManagerSlots({
    companyId: applicant.companyId,
    managerUserId: manager.id,
  });
  const match = slots.find((slot) => slot.startAt === startAt.toISOString());
  if (!match) {
    return NextResponse.json({ error: "That time is no longer available" }, { status: 409 });
  }

  const endAt = addMinutes(startAt, HIRING_SCREEN_MINUTES);
  const booking = await prisma.hiringScreenBooking.create({
    data: {
      companyId: applicant.companyId,
      applicantId: applicant.id,
      managerUserId: manager.id,
      startAt,
      endAt,
      status: "SCHEDULED",
    },
  });

  const whenLabel = startAt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  try {
    await sendCompanyEmail(
      {
        companyName: applicant.company.name,
        sendgridFrom: applicant.company.sendgridFrom,
        emailSenderName: applicant.company.emailSenderName,
        emailLogoUrl: applicant.company.emailLogoUrl,
      },
      {
        companyId: applicant.companyId,
        to: [applicant.email],
        subject: `Phone screen confirmed — ${applicant.jobTitle || applicant.jobSlug}`,
        text: `Your phone screen is confirmed for ${whenLabel}. Someone from ${applicant.company.name} will call you.`,
        html: `<p>Your phone screen is confirmed for <strong>${whenLabel}</strong>.</p><p>Someone from ${applicant.company.name} will call you at the number you provided.</p>`,
      }
    );
  } catch (err) {
    console.error("Hiring booking confirmation email failed:", err);
  }

  await notifyStaffInApp({
    companyId: applicant.companyId,
    type: AppNotificationType.HIRING_SCREEN_BOOKED,
    title: `Phone screen booked: ${applicant.name}`,
    body: `${whenLabel} · ${applicant.jobTitle || applicant.jobSlug}`,
    href: `/hiring/applicants/${applicant.id}`,
    userIds: [manager.id],
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    booking: {
      id: booking.id,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
    },
  });
}
