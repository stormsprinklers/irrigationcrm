import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser } from "@/lib/api-auth";
import { getDefaultFromEmail, getTwilioEmailAuthStatus, sendEmail } from "@/lib/inbox/email";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const body = await request.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to.trim() : user.email?.trim();
    if (!to) {
      return NextResponse.json({ error: "Recipient email required" }, { status: 400 });
    }

    const status = getTwilioEmailAuthStatus();
    if (!status.configured) {
      return NextResponse.json({ error: status.issues.join(" ") }, { status: 503 });
    }

    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    const from = company?.sendgridFrom ?? getDefaultFromEmail();
    if (!from) {
      return NextResponse.json(
        { error: "From email address not configured. Set TWILIO_FROM_EMAIL or Settings → Inbox." },
        { status: 400 }
      );
    }

    const result = await sendEmail({
      from,
      to: [to],
      subject: "Irrigation CRM test email",
      text: "This is a test email from Irrigation CRM. If you received this, Twilio Email is configured correctly.",
      html: "<p>This is a test email from <strong>Irrigation CRM</strong>.</p><p>If you received this, Twilio Email is configured correctly.</p>",
      replyTo: user.email ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      to,
      from,
      messageId: result.messageId,
      authSource: status.authSource,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test email failed" },
      { status: 500 }
    );
  }
}
