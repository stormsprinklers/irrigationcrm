import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";
import { renderMarketingMergeFields } from "@/lib/marketing/render-merge";
import { resolveMarketingEmailFrom } from "@/lib/marketing/sender";
import { prisma } from "@/lib/prisma";

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject : "";
    const bodyHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
    const bodyText =
      typeof body.bodyText === "string" && body.bodyText.trim()
        ? body.bodyText
        : htmlToPlainText(bodyHtml);

    if (!looksLikeEmail(to)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (!subject.trim() && !bodyHtml.trim() && !bodyText.trim()) {
      return NextResponse.json({ error: "Add a subject or email body first" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const fromEmail = resolveMarketingEmailFrom(company);
    if (!fromEmail) {
      return NextResponse.json(
        { error: "From email address not configured. Set it under Settings → Inbox." },
        { status: 400 }
      );
    }

    const matchedCustomer = await prisma.customer.findFirst({
      where: {
        companyId: user.companyId,
        email: { equals: to, mode: "insensitive" },
      },
      select: { name: true, address: true, city: true, state: true, zip: true },
    });

    const personalized = renderMarketingMergeFields({
      company,
      customer: matchedCustomer ?? {
        name: user.name || "Customer",
        address: null,
        city: null,
        state: null,
        zip: null,
      },
      subject,
      bodyText,
      bodyHtml: bodyHtml || null,
    });

    const html =
      personalized.bodyHtml ?? `<p>${personalized.bodyText.replace(/\n/g, "<br/>")}</p>`;

    const result = await sendCompanyEmail(
      {
        companyName: company.name,
        sendgridFrom: fromEmail,
        emailSenderName: company.emailSenderName,
        emailLogoUrl: company.emailLogoUrl,
      },
      {
        companyId: user.companyId,
        to: [to],
        subject: personalized.subject || company.name,
        text: personalized.bodyText,
        html,
        replyTo: user.email || undefined,
        bypassCommsFreeze: true,
      }
    );

    return NextResponse.json({ ok: true, to, messageId: result.messageId });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test email failed" },
      { status: 500 }
    );
  }
}
