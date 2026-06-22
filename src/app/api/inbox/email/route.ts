import { NextRequest, NextResponse } from "next/server";
import { EmailFolder, Scope } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse, badRequestResponse, forbiddenResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isContactBlocked } from "@/lib/inbox/contacts";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const folder = (request.nextUrl.searchParams.get("folder") ?? "INBOX").toUpperCase() as EmailFolder;
    const scopeParam = request.nextUrl.searchParams.get("scope") ?? "external";
    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;

    const emails = await prisma.emailMessage.findMany({
      where: { companyId: user.companyId, folder, scope },
      include: { customer: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(emails);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const {
      to,
      subject,
      bodyText,
      bodyHtml,
      customerId,
      scope: scopeParam,
      saveAsDraft,
    } = body;

    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;
    const toEmails: string[] = Array.isArray(to) ? to : [to].filter(Boolean);

    if (saveAsDraft) {
      const draft = await prisma.emailMessage.create({
        data: {
          companyId: user.companyId,
          scope,
          folder: EmailFolder.DRAFT,
          fromEmail: user.email,
          toEmails,
          subject: subject ?? "",
          bodyText: bodyText ?? "",
          bodyHtml: bodyHtml ?? "",
          customerId,
          userId: user.id,
        },
      });
      return NextResponse.json(draft);
    }

    if (!toEmails.length || !subject) {
      return badRequestResponse("Recipient and subject required");
    }

    if (scope === Scope.EXTERNAL) {
      for (const email of toEmails) {
        const blocked = await isContactBlocked(user.companyId, null, email);
        if (blocked) return forbiddenResponse(`Contact ${email} is blocked`);
      }

      const company = await prisma.company.findUnique({ where: { id: user.companyId } });
      if (!company) return badRequestResponse("Company not found");

      const branding = {
        companyName: company.name,
        sendgridFrom: company.sendgridFrom,
        emailSenderName: company.emailSenderName,
        emailLogoUrl: company.emailLogoUrl,
      };

      await sendCompanyEmail(branding, {
        to: toEmails,
        subject,
        text: bodyText,
        html: bodyHtml ?? `<p>${(bodyText ?? "").replace(/\n/g, "<br/>")}</p>`,
        replyTo: user.email,
      });
    }

    const sent = await prisma.emailMessage.create({
      data: {
        companyId: user.companyId,
        scope,
        folder: EmailFolder.SENT,
        fromEmail: user.email,
        toEmails,
        subject,
        bodyText: bodyText ?? "",
        bodyHtml: bodyHtml ?? "",
        customerId,
        userId: user.id,
      },
    });

    return NextResponse.json(sent);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
