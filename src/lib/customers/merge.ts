import { CampaignEnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
        stripeCustomerId: target.stripeCustomerId ?? source.stripeCustomerId,
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

    const sourceLead = await tx.lead.findFirst({ where: { convertedCustomerId: sourceId } });
    const targetLead = await tx.lead.findFirst({ where: { convertedCustomerId: targetId } });
    if (sourceLead && !targetLead) {
      await tx.lead.update({
        where: { id: sourceLead.id },
        data: { convertedCustomerId: targetId },
      });
    } else if (sourceLead && targetLead) {
      await tx.lead.update({
        where: { id: sourceLead.id },
        data: { convertedCustomerId: null },
      });
    }

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
