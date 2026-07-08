import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser } from "@/lib/api-auth";
import { getTwilioEmailAuthStatus } from "@/lib/inbox/email";
import { resolveFromAddress, sendCompanyEmail } from "@/lib/inbox/email-branding";
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
    const branding = {
      companyName: company?.name ?? "Your company",
      sendgridFrom: company?.sendgridFrom,
      emailSenderName: company?.emailSenderName,
      emailLogoUrl: company?.emailLogoUrl,
    };
    const from = resolveFromAddress(branding);
    if (!from) {
      return NextResponse.json(
        { error: "From email address not configured. Set TWILIO_FROM_EMAIL or Settings → Inbox." },
        { status: 400 }
      );
    }

    const result = await sendCompanyEmail(branding, {
      companyId: user.companyId,
      // Admin diagnostic — allowed even while outbound comms are frozen.
      bypassCommsFreeze: true,
      to: [to],
      subject: `${branding.companyName} — test email`,
      text: `This is a test email from ${branding.companyName}. If you received this, outbound email is configured correctly.`,
      html: `<p>This is a test email from <strong>${branding.companyName}</strong>.</p><p>If you received this, outbound email is configured correctly.</p>`,
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
