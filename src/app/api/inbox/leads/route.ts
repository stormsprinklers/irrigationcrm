import { NextResponse } from "next/server";
import { MessageDirection, Scope } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  leadIdFromThreadId,
  parseWebsiteFormName,
  parseWebsiteFormSource,
  WEBSITE_FORM_SMS_PREFIX,
  WEBSITE_LEAD_THREAD_PREFIX,
} from "@/lib/inbox/website-leads";
import { prisma } from "@/lib/prisma";

export type WebsiteLeadInboxItem = {
  id: string;
  channel: "email" | "sms";
  name: string;
  source: string | null;
  subject: string | null;
  preview: string;
  createdAt: string;
  isRead: boolean;
  leadId: string | null;
  conversationId?: string;
};

export async function GET() {
  try {
    const user = await requireSessionUser();

    const [emailLeads, smsLeadMessages] = await Promise.all([
      prisma.emailMessage.findMany({
        where: {
          companyId: user.companyId,
          threadId: { startsWith: WEBSITE_LEAD_THREAD_PREFIX },
          folder: { not: "TRASH" },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.message.findMany({
        where: {
          direction: MessageDirection.INBOUND,
          body: { startsWith: WEBSITE_FORM_SMS_PREFIX },
          conversation: {
            companyId: user.companyId,
            scope: Scope.EXTERNAL,
          },
        },
        include: {
          conversation: { select: { id: true, title: true, participantPhone: true } },
        },
        orderBy: { sentAt: "desc" },
        take: 100,
      }),
    ]);

    const emailItems: WebsiteLeadInboxItem[] = emailLeads.map((row) => ({
      id: row.id,
      channel: "email",
      name: parseWebsiteFormName(row.subject) ?? row.fromEmail,
      source: parseWebsiteFormSource(row.subject),
      subject: row.subject,
      preview: row.bodyText?.slice(0, 160) ?? "",
      createdAt: row.createdAt.toISOString(),
      isRead: row.isRead,
      leadId: leadIdFromThreadId(row.threadId),
    }));

    const smsItems: WebsiteLeadInboxItem[] = smsLeadMessages.map((row) => {
      const title = row.conversation.title ?? row.conversation.participantPhone ?? "Website form";
      const sourceMatch = row.body.match(/^\[Website form — ([^\]]+)\]/);
      return {
        id: row.id,
        channel: "sms",
        name: title,
        source: sourceMatch?.[1]?.trim() ?? null,
        subject: null,
        preview: row.body.replace(/^\[Website form[^\]]*\]\s*/, "").slice(0, 160),
        createdAt: row.sentAt.toISOString(),
        isRead: false,
        leadId: null,
        conversationId: row.conversationId,
      };
    });

    const items = [...emailItems, ...smsItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);

    return NextResponse.json({ items });
  } catch {
    return unauthorizedResponse();
  }
}
