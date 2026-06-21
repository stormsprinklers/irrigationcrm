import { NextRequest, NextResponse } from "next/server";
import { EmailFolder, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isContactBlocked } from "@/lib/inbox/contacts";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  let from = "";
  let to = "";
  let subject = "(No subject)";
  let text = "";
  let html = "";

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    from = String(formData.get("from") ?? "");
    to = String(formData.get("to") ?? "");
    subject = String(formData.get("subject") ?? "(No subject)");
    text = String(formData.get("text") ?? "");
    html = String(formData.get("html") ?? "");
  } else {
    return NextResponse.json({ ok: true });
  }

  const inboundToken = request.nextUrl.searchParams.get("token");
  if (
    process.env.TWILIO_EMAIL_INBOUND_VERIFY_TOKEN &&
    inboundToken !== process.env.TWILIO_EMAIL_INBOUND_VERIFY_TOKEN
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  await prisma.emailMessage.create({
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

  return NextResponse.json({ ok: true });
}
