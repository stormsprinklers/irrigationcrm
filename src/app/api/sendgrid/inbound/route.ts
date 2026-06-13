import { NextRequest, NextResponse } from "next/server";
import { EmailFolder, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isContactBlocked } from "@/lib/inbox/contacts";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const subject = String(formData.get("subject") ?? "(No subject)");
  const text = String(formData.get("text") ?? "");
  const html = String(formData.get("html") ?? "");

  const toAddress = to.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? to;
  const fromAddress = from.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? from;

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { sendgridFrom: toAddress },
        { sendgridFrom: { contains: toAddress.split("@")[1] ?? "" } },
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
