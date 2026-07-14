import { NextResponse } from "next/server";
import { MessageDirection, Scope } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  leadIdFromThreadId,
  parseWebsiteFormName,
  parseWebsiteFormSmsPrefix,
  parseWebsiteFormSource,
  WEBSITE_FORM_SMS_PREFIX,
  WEBSITE_LEAD_THREAD_PREFIX,
} from "@/lib/inbox/website-leads";
import { leadPhoneKey } from "@/lib/leads/contact-status";
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
  leadStatus: string | null;
  contactedAt: string | null;
  leadCreatedAt: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  convertedCustomerId: string | null;
};

type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  externalId: string | null;
  status: string;
  contactedAt: Date | null;
  createdAt: Date;
  convertedCustomerId: string | null;
};

const leadSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  externalId: true,
  status: true,
  contactedAt: true,
  createdAt: true,
  convertedCustomerId: true,
} as const;

function isCareersLeadRow(lead: LeadRow | null | undefined) {
  if (!lead) return false;
  if (lead.source?.toLowerCase() === "careers") return true;
  if (lead.externalId?.startsWith("careers:")) return true;
  return false;
}

function withLead(
  base: {
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
    fallbackPhone?: string | null;
    fallbackEmail?: string | null;
  },
  lead: LeadRow | null | undefined
): WebsiteLeadInboxItem {
  return {
    id: base.id,
    channel: base.channel,
    name: lead?.name ?? base.name,
    source: base.source,
    subject: base.subject,
    preview: base.preview,
    createdAt: base.createdAt,
    isRead: base.isRead,
    leadId: lead?.id ?? base.leadId,
    conversationId: base.conversationId,
    leadStatus: lead?.status ?? null,
    contactedAt: lead?.contactedAt?.toISOString() ?? null,
    leadCreatedAt: lead?.createdAt.toISOString() ?? null,
    leadPhone: lead?.phone ?? base.fallbackPhone ?? null,
    leadEmail: lead?.email ?? base.fallbackEmail ?? null,
    convertedCustomerId: lead?.convertedCustomerId ?? null,
  };
}

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

    const leadIdsFromEmail = emailLeads
      .map((row) => leadIdFromThreadId(row.threadId))
      .filter((id): id is string => Boolean(id));

    const leadIdsFromSms = smsLeadMessages
      .map((row) => parseWebsiteFormSmsPrefix(row.body).leadId)
      .filter((id): id is string => Boolean(id));

    const leadIds = [...new Set([...leadIdsFromEmail, ...leadIdsFromSms])];

    const leadsByIdRows =
      leadIds.length > 0
        ? await prisma.lead.findMany({
            where: { companyId: user.companyId, id: { in: leadIds } },
            select: leadSelect,
          })
        : [];
    const leadsById = new Map(leadsByIdRows.map((lead) => [lead.id, lead]));

    const smsPhoneKeys = [
      ...new Set(
        smsLeadMessages
          .map((row) => leadPhoneKey(row.conversation.participantPhone))
          .filter((key): key is string => Boolean(key))
      ),
    ];

    const leadsByPhone = new Map<string, LeadRow>();
    if (smsPhoneKeys.length > 0) {
      const phoneLeads = await prisma.lead.findMany({
        where: {
          companyId: user.companyId,
          phone: { not: null },
          OR: smsPhoneKeys.map((key) => ({ phone: { contains: key } })),
        },
        select: leadSelect,
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      for (const lead of phoneLeads) {
        const key = leadPhoneKey(lead.phone);
        if (key && !leadsByPhone.has(key)) leadsByPhone.set(key, lead);
      }
    }

    const emailItems = emailLeads.map((row) => {
      const leadId = leadIdFromThreadId(row.threadId);
      const lead = leadId ? leadsById.get(leadId) : null;
      const fallbackEmail =
        row.fromEmail && !row.fromEmail.includes("website-forms@") ? row.fromEmail : null;
      return withLead(
        {
          id: row.id,
          channel: "email",
          name: parseWebsiteFormName(row.subject) ?? row.fromEmail,
          source: parseWebsiteFormSource(row.subject),
          subject: row.subject,
          preview: row.bodyText?.slice(0, 160) ?? "",
          createdAt: row.createdAt.toISOString(),
          isRead: row.isRead,
          leadId,
          fallbackEmail,
        },
        lead
      );
    });

    const smsItems = smsLeadMessages.map((row) => {
      const title = row.conversation.title ?? row.conversation.participantPhone ?? "Website form";
      const parsed = parseWebsiteFormSmsPrefix(row.body);
      const phoneKey = leadPhoneKey(row.conversation.participantPhone);
      const lead =
        (parsed.leadId ? leadsById.get(parsed.leadId) : null) ??
        (phoneKey ? leadsByPhone.get(phoneKey) : null) ??
        null;
      return withLead(
        {
          id: row.id,
          channel: "sms",
          name: title,
          source: parsed.source,
          subject: null,
          preview: row.body.replace(/^\[Website form[^\]]*\]\s*/, "").slice(0, 160),
          createdAt: row.sentAt.toISOString(),
          isRead: false,
          leadId: lead?.id ?? parsed.leadId,
          conversationId: row.conversationId,
          fallbackPhone: row.conversation.participantPhone,
        },
        lead
      );
    });

    const items = [...emailItems, ...smsItems]
      .filter((item) => {
        // Careers applications belong in Hiring, not Inbox → Leads
        if (item.source?.toLowerCase() === "careers") return false;
        const lead =
          (item.leadId ? leadsById.get(item.leadId) : null) ??
          null;
        if (isCareersLeadRow(lead)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);

    return NextResponse.json({ items });
  } catch {
    return unauthorizedResponse();
  }
}
