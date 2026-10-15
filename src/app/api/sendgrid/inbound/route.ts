import { NextRequest, NextResponse } from "next/server";
import { EmailFolder, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isContactBlocked } from "@/lib/inbox/contacts";
import { notifyInboundEmail } from "@/lib/notifications/in-app";
import { uploadPrivateBlob, assertBlobConfigured } from "@/lib/blob/storage";
import {
  EMAIL_ATTACHMENT_MAX_BYTES,
  EMAIL_ATTACHMENT_MAX_COUNT,
  EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  hasExpectedFileSignature,
  isAllowedEmailMimeType,
  safeFileName,
} from "@/lib/inbox/attachments";
import { verifySharedSecret } from "@/lib/security/trusted-request";

const MAX_INBOUND_EMAIL_BYTES = 30 * 1024 * 1024;

async function saveInboundAttachments(
  companyId: string,
  emailMessageId: string,
  formData: FormData
) {
  try {
    assertBlobConfigured();
  } catch {
    return;
  }

  const attachmentInfoRaw = formData.get("attachment-info");
  if (!attachmentInfoRaw) return;

  let attachmentInfo: Record<string, { filename?: string; type?: string }> = {};
  try {
    attachmentInfo = JSON.parse(String(attachmentInfoRaw));
  } catch {
    return;
  }

  const entries = Object.entries(attachmentInfo);
  if (entries.length > EMAIL_ATTACHMENT_MAX_COUNT) {
    throw new Error("Too many inbound email attachments");
  }
  let totalBytes = 0;

  for (const [fieldName, meta] of entries) {
    const file = formData.get(fieldName);
    if (!file || !(file instanceof File) || file.size <= 0) continue;

    const mimeType = String(meta.type ?? file.type).toLowerCase();
    totalBytes += file.size;
    if (
      file.size > EMAIL_ATTACHMENT_MAX_BYTES ||
      totalBytes > EMAIL_ATTACHMENT_MAX_TOTAL_BYTES ||
      !isAllowedEmailMimeType(mimeType) ||
      !(await hasExpectedFileSignature(new File([file], file.name, { type: mimeType })))
    ) {
      throw new Error("Inbound email attachment rejected by security policy");
    }

    const safeName = safeFileName(meta.filename ?? file.name);
    const blob = await uploadPrivateBlob(
      `inbox/${companyId}/email/inbound/${emailMessageId}/${Date.now()}-${safeName}`,
      file,
      { contentType: mimeType }
    );

    await prisma.emailAttachment.create({
      data: {
        emailMessageId,
        blobUrl: blob.url,
        fileName: meta.filename ?? file.name,
        mimeType,
        sizeBytes: file.size,
      },
    });
  }
}

export async function POST(request: NextRequest) {
  const configuredInboundToken = process.env.TWILIO_EMAIL_INBOUND_VERIFY_TOKEN?.trim();
  if (!configuredInboundToken) {
    return NextResponse.json(
      { error: "Inbound email authentication is not configured" },
      { status: 503 }
    );
  }
  const inboundToken = request.nextUrl.searchParams.get("token") ?? "";
  if (!verifySharedSecret(inboundToken, configuredInboundToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_INBOUND_EMAIL_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  let from = "";
  let to = "";
  let subject = "(No subject)";
  let text = "";
  let html = "";
  let formData: FormData | null = null;

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    formData = await request.formData();
    from = String(formData.get("from") ?? "");
    to = String(formData.get("to") ?? "");
    subject = String(formData.get("subject") ?? "(No subject)");
    text = String(formData.get("text") ?? "");
    html = String(formData.get("html") ?? "");
  } else {
    return NextResponse.json({ ok: true });
  }

  const toAddress = to.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? to;
  const fromAddress = from.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? from;

  const toDomain = toAddress.split("@")[1];

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { sendgridFrom: toAddress },
        ...(toDomain
          ? [
              { sendgridFrom: { contains: toDomain } },
              { sendgridInboundDomain: toDomain },
              { sendgridInboundDomain: { contains: toDomain } },
            ]
          : []),
        ...(process.env.TWILIO_EMAIL_INBOUND_DOMAIN
          ? [{ sendgridInboundDomain: process.env.TWILIO_EMAIL_INBOUND_DOMAIN }]
          : []),
      ],
    },
  });

  if (!company) return NextResponse.json({ ok: true });

  const blocked = await isContactBlocked(company.id, null, fromAddress);
  if (blocked) return NextResponse.json({ ok: true });

  const customer = await prisma.customer.findFirst({
    where: { companyId: company.id, email: fromAddress },
  });

  const emailMessage = await prisma.emailMessage.create({
    data: {
      companyId: company.id,
      scope: Scope.EXTERNAL,
      folder: EmailFolder.INBOX,
      fromEmail: fromAddress,
      toEmails: [toAddress],
      subject,
      bodyText: text,
      bodyHtml: html || null,
      customerId: customer?.id,
      isRead: false,
    },
  });

  if (formData) {
    try {
      await saveInboundAttachments(company.id, emailMessage.id, formData);
    } catch (error) {
      console.error("Inbound email attachment save failed", error);
    }
  }

  notifyInboundEmail({
    companyId: company.id,
    emailId: emailMessage.id,
    fromEmail: fromAddress,
    subject,
  }).catch((err) => console.error("In-app notification failed for inbound email", err));

  if (customer?.id) {
    void import("@/lib/marketing/flow-engine")
      .then(({ advanceWaitOnCustomerReply }) =>
        advanceWaitOnCustomerReply({
          companyId: company.id,
          customerId: customer.id,
          text: `${subject}\n${text ?? ""}`,
          channel: "email",
        })
      )
      .catch((err) => console.error("Campaign wait reply check failed", err));
  }

  return NextResponse.json({ ok: true });
}
