import { NextRequest, NextResponse } from "next/server";
import { AppNotificationType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requirePortalCustomer,
  portalUnauthorizedResponse,
} from "@/lib/portal/auth";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: NextRequest) {
  const ctx = await requirePortalCustomer();
  if (!ctx) return portalUnauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as {
    subject?: string;
    message?: string;
    phone?: string;
  };

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!message || message.length < 5) {
    return NextResponse.json({ error: "Please enter a message" }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }
  if (subject.length > 200) {
    return NextResponse.json({ error: "Subject is too long" }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: ctx.customerId, companyId: ctx.companyId },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!customer) return portalUnauthorizedResponse();

  const contactPhone = phone || customer.phone || "";
  const titleSubject = subject || "Customer portal message";
  const notifyBody = [
    subject ? `Subject: ${subject}` : null,
    contactPhone ? `Phone: ${contactPhone}` : null,
    customer.email ? `Email: ${customer.email}` : null,
    "",
    message,
  ]
    .filter((line) => line !== null)
    .join("\n")
    .slice(0, 500);

  const staff = await prisma.user.findMany({
    where: {
      companyId: ctx.companyId,
      status: "ACTIVE",
      role: { in: [UserRole.ADMIN, UserRole.CSR, UserRole.MANAGER] },
    },
    select: { id: true },
  });

  await notifyStaffInApp({
    companyId: ctx.companyId,
    type: AppNotificationType.PORTAL_CONTACT,
    title: `Portal contact: ${customer.name}`,
    body: notifyBody,
    href: `/customers/${customer.id}`,
    userIds: staff.map((u) => u.id),
  });

  const supportEmail = ctx.company.supportEmail?.trim();
  if (supportEmail && isEmailConfigured()) {
    try {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
      const text = [
        `Customer: ${customer.name}`,
        customer.email ? `Email: ${customer.email}` : null,
        contactPhone ? `Phone: ${contactPhone}` : null,
        "",
        message,
        "",
        appUrl ? `Open in CRM: ${appUrl}/customers/${customer.id}` : null,
      ]
        .filter((line) => line !== null)
        .join("\n");

      await sendCompanyEmail(
        {
          companyName: ctx.company.name,
          sendgridFrom: ctx.company.sendgridFrom,
          emailSenderName: ctx.company.emailSenderName,
          emailLogoUrl: ctx.company.emailLogoUrl,
        },
        {
          companyId: ctx.companyId,
          to: [supportEmail],
          subject: `[Portal] ${titleSubject} — ${customer.name}`,
          text,
          html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
          replyTo: customer.email ?? undefined,
        }
      );
    } catch (err) {
      console.error("[portal-contact] support email failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
