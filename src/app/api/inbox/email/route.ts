import { NextRequest, NextResponse } from "next/server";
import { EmailFolder, Scope } from "@prisma/client";
import {
  requireSessionUser,
  unauthorizedResponse,
  badRequestResponse,
  forbiddenResponse,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isContactBlocked } from "@/lib/inbox/contacts";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { outboundCommsErrorResponse } from "@/lib/communications/outbound-guard";
import {
  EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  fetchBlobAsBase64,
  plainTextToEmailHtml,
  type PendingAttachment,
} from "@/lib/inbox/attachments";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailContent(params: {
  bodyText?: string;
  bodyHtml?: string;
  attachments?: PendingAttachment[];
}) {
  const fileAttachments = (params.attachments ?? []).filter(
    (item) => item.mimeType !== "text/uri-list"
  );
  const linkAttachments = (params.attachments ?? []).filter(
    (item) => item.mimeType === "text/uri-list"
  );

  let html =
    params.bodyHtml?.trim() ||
    (params.bodyText?.trim() ? plainTextToEmailHtml(params.bodyText) : "<p></p>");

  if (linkAttachments.length) {
    const linksHtml = linkAttachments
      .map((item) => {
        const label = item.fileName.replace(/^link:/, "") || item.publicUrl || "Link";
        const href = escapeHtml(item.publicUrl ?? item.blobUrl);
        return `<a href="${href}" style="color:#2563eb;text-decoration:underline">${escapeHtml(label)}</a>`;
      })
      .join("<br/>");
    html += `<p style="margin-top:12px">${linksHtml}</p>`;
  }

  const text =
    params.bodyText?.trim() ||
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();

  const totalBytes = fileAttachments.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
  if (totalBytes > EMAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
    throw new Error("Total attachment size must be under 25MB");
  }

  return { html, text, fileAttachments };
}

async function createEmailAttachments(
  emailMessageId: string,
  attachments: PendingAttachment[]
) {
  const fileAttachments = attachments.filter((item) => item.mimeType !== "text/uri-list");
  if (!fileAttachments.length) return;

  await prisma.emailAttachment.createMany({
    data: fileAttachments.map((item) => ({
      emailMessageId,
      blobUrl: item.blobUrl,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    })),
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const folder = (request.nextUrl.searchParams.get("folder") ?? "INBOX").toUpperCase() as EmailFolder;
    const scopeParam = request.nextUrl.searchParams.get("scope") ?? "external";
    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;

    const emails = await prisma.emailMessage.findMany({
      where: { companyId: user.companyId, folder, scope },
      include: {
        customer: true,
        user: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
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
      attachments = [],
    } = body as {
      to?: string | string[];
      subject?: string;
      bodyText?: string;
      bodyHtml?: string;
      customerId?: string;
      scope?: string;
      saveAsDraft?: boolean;
      attachments?: PendingAttachment[];
    };

    const scope = scopeParam === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;
    const toEmails: string[] = (Array.isArray(to) ? to : [to]).filter(
      (value): value is string => Boolean(value)
    );
    const pendingAttachments = Array.isArray(attachments) ? attachments : [];
    const { html, text, fileAttachments } = buildEmailContent({
      bodyText,
      bodyHtml,
      attachments: pendingAttachments,
    });

    if (saveAsDraft) {
      const draft = await prisma.emailMessage.create({
        data: {
          companyId: user.companyId,
          scope,
          folder: EmailFolder.DRAFT,
          fromEmail: user.email,
          toEmails,
          subject: subject ?? "",
          bodyText: text,
          bodyHtml: html,
          customerId,
          userId: user.id,
        },
      });
      await createEmailAttachments(draft.id, pendingAttachments);
      const withAttachments = await prisma.emailMessage.findUnique({
        where: { id: draft.id },
        include: { attachments: true },
      });
      return NextResponse.json(withAttachments);
    }

    if (!toEmails.length || !subject) {
      return badRequestResponse("Recipient and subject required");
    }

    if (!text.trim() && !html.replace(/<[^>]+>/g, "").trim() && !fileAttachments.length) {
      return badRequestResponse("Message body or attachment required");
    }

    if (scope === Scope.EXTERNAL) {
      for (const email of toEmails) {
        const blocked = await isContactBlocked(user.companyId, null, email);
        if (blocked) return forbiddenResponse(`Contact ${email} is blocked`);
      }

      const company = await prisma.company.findUnique({ where: { id: user.companyId } });
      if (!company) return badRequestResponse("Company not found");

      const twilioAttachments = await Promise.all(
        fileAttachments.map(async (item) => ({
          filename: item.fileName,
          contentType: item.mimeType,
          content: await fetchBlobAsBase64(item.blobUrl),
        }))
      );

      const branding = {
        companyName: company.name,
        sendgridFrom: company.sendgridFrom,
        emailSenderName: company.emailSenderName,
        emailLogoUrl: company.emailLogoUrl,
      };

      await sendCompanyEmail(branding, {
        companyId: user.companyId,
        to: toEmails,
        subject,
        text,
        html,
        replyTo: user.email,
        attachments: twilioAttachments.length ? twilioAttachments : undefined,
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
        bodyText: text,
        bodyHtml: html,
        customerId,
        userId: user.id,
      },
    });

    await createEmailAttachments(sent.id, pendingAttachments);

    const withAttachments = await prisma.emailMessage.findUnique({
      where: { id: sent.id },
      include: { attachments: true },
    });

    return NextResponse.json(withAttachments);
  } catch (error) {
    const commsDisabled = outboundCommsErrorResponse(error);
    if (commsDisabled) return commsDisabled;
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
