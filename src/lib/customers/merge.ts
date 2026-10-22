import { CampaignEnrollmentStatus, type SalesPipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function earlierDate(a: Date | null, b: Date | null) {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function mergedPipelineStage(a: SalesPipelineStage | null, b: SalesPipelineStage | null) {
  const rank = { LEAD: 0, QUALIFIED: 1, CONVERTED: 2, SOLD: 3, DISQUALIFIED: -1 } as const;
  if (!a) return b;
  if (!b) return a;
  return rank[a] >= rank[b] ? a : b;
}

export async function mergeCustomers(params: {
  companyId: string;
  sourceId: string;
  targetId: string;
}) {
  const { companyId, sourceId, targetId } = params;
  if (sourceId === targetId) {
    throw new Error("Cannot merge a customer into itself");
  }

  const [source, target] = await Promise.all([
    prisma.customer.findFirst({ where: { id: sourceId, companyId } }),
    prisma.customer.findFirst({ where: { id: targetId, companyId } }),
  ]);

  if (!source || !target) {
    throw new Error("Customer not found");
  }

  const sourceHasEarlierFirstTouch =
    Boolean(source.firstTouchAt) &&
    (!target.firstTouchAt || source.firstTouchAt! < target.firstTouchAt);
  const firstTouchPrimary = sourceHasEarlierFirstTouch ? source : target;
  const firstTouchFallback = sourceHasEarlierFirstTouch ? target : source;

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: targetId },
      data: {
        phone: target.phone ?? source.phone,
        email: target.email ?? source.email,
        companyName: target.companyName ?? source.companyName,
        address: target.address ?? source.address,
        city: target.city ?? source.city,
        state: target.state ?? source.state,
        zip: target.zip ?? source.zip,
        leadSource: target.leadSource ?? source.leadSource,
        attributionChannel: firstTouchPrimary.attributionChannel ?? firstTouchFallback.attributionChannel,
        attributionSource: firstTouchPrimary.attributionSource ?? firstTouchFallback.attributionSource,
        attributionMedium: firstTouchPrimary.attributionMedium ?? firstTouchFallback.attributionMedium,
        attributionCampaign: firstTouchPrimary.attributionCampaign ?? firstTouchFallback.attributionCampaign,
        attributionTerm: firstTouchPrimary.attributionTerm ?? firstTouchFallback.attributionTerm,
        attributionContent: firstTouchPrimary.attributionContent ?? firstTouchFallback.attributionContent,
        gclid: firstTouchPrimary.gclid ?? firstTouchFallback.gclid,
        gbraid: firstTouchPrimary.gbraid ?? firstTouchFallback.gbraid,
        wbraid: firstTouchPrimary.wbraid ?? firstTouchFallback.wbraid,
        fbc: firstTouchPrimary.fbc ?? firstTouchFallback.fbc,
        fbp: firstTouchPrimary.fbp ?? firstTouchFallback.fbp,
        userAgent: firstTouchPrimary.userAgent ?? firstTouchFallback.userAgent,
        fbclid: firstTouchPrimary.fbclid ?? firstTouchFallback.fbclid,
        msclkid: firstTouchPrimary.msclkid ?? firstTouchFallback.msclkid,
        firstTouchAt: earlierDate(target.firstTouchAt, source.firstTouchAt),
        firstTouchMethod: firstTouchPrimary.firstTouchMethod ?? firstTouchFallback.firstTouchMethod,
        stripeCustomerId: target.stripeCustomerId ?? source.stripeCustomerId,
        pipelineStage: mergedPipelineStage(target.pipelineStage, source.pipelineStage),
        pipelineLeadAt: earlierDate(target.pipelineLeadAt, source.pipelineLeadAt),
        pipelineQualifiedAt: earlierDate(target.pipelineQualifiedAt, source.pipelineQualifiedAt),
        pipelineConvertedAt: earlierDate(target.pipelineConvertedAt, source.pipelineConvertedAt),
        pipelineSoldAt: earlierDate(target.pipelineSoldAt, source.pipelineSoldAt),
        pipelineDisqualifiedAt: earlierDate(target.pipelineDisqualifiedAt, source.pipelineDisqualifiedAt),
        pipelineLeadSource: target.pipelineLeadSource ?? source.pipelineLeadSource,
        pipelineFirstContactedAt: earlierDate(target.pipelineFirstContactedAt, source.pipelineFirstContactedAt),
        pipelineLeadId: target.pipelineLeadId ?? source.pipelineLeadId,
        marketingEmailOptOut: target.doNotService || source.doNotService || target.marketingEmailOptOut || source.marketingEmailOptOut,
        marketingSmsOptOut: target.doNotService || source.doNotService || target.marketingSmsOptOut || source.marketingSmsOptOut,
        appointmentReminderEmailOptOut: target.doNotService || source.doNotService || target.appointmentReminderEmailOptOut || source.appointmentReminderEmailOptOut,
        appointmentReminderSmsOptOut: target.doNotService || source.doNotService || target.appointmentReminderSmsOptOut || source.appointmentReminderSmsOptOut,
        doNotService: target.doNotService || source.doNotService,
        tags: [...new Set([...target.tags, ...source.tags])],
      },
    });

    const sourceBlocked = await tx.blockedContact.findUnique({ where: { customerId: sourceId } });
    const targetBlocked = await tx.blockedContact.findUnique({ where: { customerId: targetId } });
    if (sourceBlocked) {
      if (targetBlocked) {
        await tx.blockedContact.delete({ where: { id: sourceBlocked.id } });
      } else {
        await tx.blockedContact.update({
          where: { id: sourceBlocked.id },
          data: { customerId: targetId },
        });
      }
    }

    await tx.lead.updateMany({
      where: { companyId, convertedCustomerId: sourceId },
      data: { convertedCustomerId: targetId },
    });

    const moveCustomerId = [
      tx.customerProperty.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.visit.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.estimate.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.invoice.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.maintenancePlanEnrollment.updateMany({
        where: { customerId: sourceId },
        data: { customerId: targetId },
      }),
      tx.callLog.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.conversation.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.emailMessage.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.callSession.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.campaignRecipient.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.customerPhone.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.customerNote.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }),
      tx.customerAttachment.updateMany({
        where: { customerId: sourceId },
        data: { customerId: targetId },
      }),
    ];
    await Promise.all(moveCustomerId);

    if (target.doNotService || source.doNotService) {
      await tx.campaignEnrollment.updateMany({
        where: { customerId: targetId, campaign: { companyId }, status: { in: [CampaignEnrollmentStatus.ACTIVE, CampaignEnrollmentStatus.PAUSED] } },
        data: { status: CampaignEnrollmentStatus.CANCELLED },
      });
      await tx.campaignRecipient.updateMany({
        where: { customerId: targetId, campaign: { companyId }, status: "pending" },
        data: { status: "opt_out", error: "Do not service" },
      });
    }

    const sourceEmails = await tx.customerEmail.findMany({ where: { customerId: sourceId } });
    const targetEmails = await tx.customerEmail.findMany({ where: { customerId: targetId } });
    const knownEmails = new Set([target.email ?? source.email, ...targetEmails.map((item) => item.email)].filter(Boolean).map((email) => email!.toLowerCase()));
    for (const item of sourceEmails) {
      if (knownEmails.has(item.email.toLowerCase())) await tx.customerEmail.delete({ where: { id: item.id } });
      else {
        await tx.customerEmail.update({ where: { id: item.id }, data: { customerId: targetId } });
        knownEmails.add(item.email.toLowerCase());
      }
    }
    if (source.email && !knownEmails.has(source.email.toLowerCase())) {
      await tx.customerEmail.create({ data: { companyId, customerId: targetId, email: source.email, note: "Merged from duplicate customer" } });
    }
    await tx.hcpEntityMapping.updateMany({
      where: { companyId, entityType: "CUSTOMER", localId: sourceId },
      data: { localId: targetId, migrationId: null },
    });

    const sourceMembers = await tx.contactListMember.findMany({ where: { customerId: sourceId } });
    for (const member of sourceMembers) {
      const existing = await tx.contactListMember.findFirst({
        where: { listId: member.listId, customerId: targetId },
      });
      if (existing) {
        await tx.contactListMember.delete({ where: { id: member.id } });
      } else {
        await tx.contactListMember.update({
          where: { id: member.id },
          data: { customerId: targetId },
        });
      }
    }

    if (source.phone && source.phone !== target.phone) {
      const exists = await tx.customerPhone.findFirst({
        where: { customerId: targetId, phone: source.phone },
      });
      if (!exists) {
        await tx.customerPhone.create({
          data: {
            companyId,
            customerId: targetId,
            phone: source.phone,
            note: "Merged from duplicate customer",
          },
        });
      }
    }

    await tx.customer.delete({ where: { id: sourceId } });
  });

  return prisma.customer.findFirst({
    where: { id: targetId, companyId },
    include: {
      _count: { select: { properties: true, visits: true, estimates: true, invoices: true } },
    },
  });
}
