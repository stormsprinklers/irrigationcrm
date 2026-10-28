import {
  EmailFolder,
  MessageDirection,
  PipelineFollowUpMethod,
  PipelineFollowUpStatus,
  SalesPipelineStage,
  Scope,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isContactBlocked, normalizePhone } from "@/lib/inbox/contacts";
import { sendSms } from "@/lib/inbox/twilio";
import { recordOutboundCustomerSms } from "@/lib/inbox/record-outbound-sms";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { findOrCreateSmsConversation } from "@/lib/inbox/conversations";
import { pipelineEmailActivityStatus } from "@/lib/inbox/internal-activity";
import { getCompanyCallerId } from "@/lib/voice/company-phone";
import {
  customerFirstName,
  isWithinPipelineFollowUpSendWindow,
  normalizePipelineFollowUpSettings,
  pipelineFollowUpAnchorAt,
  renderPipelineTemplate,
} from "@/lib/customers/pipeline-followup-settings";

type ActiveStage = "LEAD" | "QUALIFIED";
type RequestedMethod = "CALL" | "SMS" | "EMAIL" | "SMS_EMAIL";

function stageKey(stage: ActiveStage) {
  return stage === "LEAD" ? "lead" : "qualified";
}

function stageEntryAt(customer: { pipelineLeadAt: Date | null; pipelineQualifiedAt: Date | null }, stage: ActiveStage) {
  return stage === "LEAD" ? customer.pipelineLeadAt : customer.pipelineQualifiedAt;
}

export async function pipelineFollowUpPreview(params: {
  companyId: string;
  customerId: string;
  stage: ActiveStage;
  employeeName: string;
  sequence?: number;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, companyId: params.companyId },
    include: { company: { select: { name: true, pipelineFollowUpSettings: true } } },
  });
  if (!customer) throw new Error("Customer not found");
  const settings = normalizePipelineFollowUpSettings(customer.company.pipelineFollowUpSettings);
  const finished = await prisma.pipelineFollowUp.findMany({
    where: {
      customerId: customer.id,
      stage: params.stage,
      status: { in: [PipelineFollowUpStatus.COMPLETED, PipelineFollowUpStatus.SKIPPED] },
    },
    select: { sequence: true },
  });
  const finishedSequences = new Set(finished.map((item) => item.sequence));
  const requestedSequence = Math.floor(params.sequence ?? 0);
  const sequence = requestedSequence >= 1 && requestedSequence <= 3
    ? requestedSequence
    : [1, 2, 3].find((item) => !finishedSequences.has(item)) ?? 3;
  const template = settings[stageKey(params.stage)][sequence - 1];
  const values = {
    customerFirstName: customerFirstName(customer.name),
    employee: params.employeeName,
    company: customer.company.name,
  };
  return {
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
    stage: params.stage,
    sequence,
    sms: renderPipelineTemplate(template.sms, values),
    emailSubject: renderPipelineTemplate(template.emailSubject, values),
    emailBody: renderPipelineTemplate(template.emailBody, values),
  };
}

async function recordPipelineEmailThreadActivity(params: {
  followUpId: string;
  companyId: string;
  customerId: string;
  phone: string | null;
  senderId: string | null;
  subject: string;
}) {
  if (!params.phone) return;
  const deliveryStatus = pipelineEmailActivityStatus(params.followUpId);
  const existing = await prisma.message.findFirst({ where: { deliveryStatus }, select: { id: true } });
  if (existing) return;
  const conversation = await findOrCreateSmsConversation({
    companyId: params.companyId,
    scope: Scope.EXTERNAL,
    participantPhone: normalizePhone(params.phone),
    customerId: params.customerId,
  });
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: params.senderId,
      direction: MessageDirection.OUTBOUND,
      body: `Email follow-up sent: ${params.subject}`,
      deliveryStatus,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.sentAt },
  });
}

export async function sendPipelineFollowUp(params: {
  companyId: string;
  customerId: string;
  stage: ActiveStage;
  sequence: number;
  method: RequestedMethod;
  automated: boolean;
  employeeId?: string | null;
  employeeName: string;
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, companyId: params.companyId },
    include: { company: true },
  });
  if (!customer) throw new Error("Customer not found");
  if (customer.givingProgramOnly || customer.pipelineRemovedAt || customer.pipelineDeclinedAt) throw new Error("Follow-ups are disabled for this customer");
  if (params.automated && customer.pipelineFollowUpsPausedAt) throw new Error("Automatic reminders are paused");
  if (params.automated) {
    const settings = normalizePipelineFollowUpSettings(customer.company.pipelineFollowUpSettings);
    if (!isWithinPipelineFollowUpSendWindow(new Date(), customer.company.timezone, settings)) {
      throw new Error("Automatic follow-ups are outside the configured sending hours");
    }
  }

  const existing = await prisma.pipelineFollowUp.findUnique({
    where: { customerId_stage_sequence: { customerId: customer.id, stage: params.stage, sequence: params.sequence } },
  });
  if (
    existing?.status === PipelineFollowUpStatus.COMPLETED ||
    existing?.status === PipelineFollowUpStatus.SKIPPED
  ) return existing;

  const preview = await pipelineFollowUpPreview({
    companyId: params.companyId,
    customerId: params.customerId,
    stage: params.stage,
    employeeName: params.employeeName,
    sequence: params.sequence,
  });
  const smsBody = params.smsBody?.trim() || preview.sms;
  const emailSubject = params.emailSubject?.trim() || preview.emailSubject;
  const emailBody = params.emailBody?.trim() || preview.emailBody;

  const followUp = await prisma.pipelineFollowUp.upsert({
    where: { customerId_stage_sequence: { customerId: customer.id, stage: params.stage, sequence: params.sequence } },
    create: {
      companyId: params.companyId,
      customerId: customer.id,
      stage: params.stage,
      sequence: params.sequence,
      method: params.method,
      automated: params.automated,
      performedById: params.employeeId ?? null,
      status: PipelineFollowUpStatus.PROCESSING,
      attemptedAt: new Date(),
      subject: params.method === "EMAIL" || params.method === "SMS_EMAIL" ? emailSubject : null,
      body: params.method === "SMS" || params.method === "CALL" ? smsBody : emailBody,
    },
    update: {
      method: params.method,
      automated: params.automated,
      performedById: params.employeeId ?? null,
      status: PipelineFollowUpStatus.PROCESSING,
      attemptedAt: new Date(),
      lastError: null,
    },
  });

  try {
    if (params.method === "CALL") {
      return prisma.pipelineFollowUp.update({
        where: { id: followUp.id },
        data: { status: PipelineFollowUpStatus.COMPLETED, completedAt: new Date(), body: null },
      });
    }

    const blocked = await isContactBlocked(params.companyId, customer.phone, customer.email);
    if (blocked || customer.doNotService) throw new Error("Customer communications are blocked");

    let smsSentAt = followUp.smsSentAt;
    let emailSentAt = followUp.emailSentAt;
    if ((params.method === "SMS" || params.method === "SMS_EMAIL") && !smsSentAt) {
      if (!customer.phone) throw new Error("Customer has no phone number");
      if (customer.marketingSmsOptOut) throw new Error("Customer opted out of SMS");
      const from = (await getCompanyCallerId(params.companyId)) ?? customer.company.twilioPhone;
      if (!from) throw new Error("Company SMS number is not configured");
      const sent = await sendSms({
        companyId: params.companyId,
        from,
        to: normalizePhone(customer.phone),
        body: smsBody,
        skipCompanyPrefix: true,
      });
      await recordOutboundCustomerSms({
        companyId: params.companyId,
        customerId: customer.id,
        to: customer.phone,
        body: smsBody,
        twilioMessageSid: sent.sid,
        senderId: params.employeeId ?? null,
      });
      smsSentAt = new Date();
      await prisma.pipelineFollowUp.update({ where: { id: followUp.id }, data: { smsSentAt } });
    }

    if ((params.method === "EMAIL" || params.method === "SMS_EMAIL") && !emailSentAt) {
      if (!customer.email) throw new Error("Customer has no email address");
      if (customer.marketingEmailOptOut) throw new Error("Customer opted out of email");
      const result = await sendCompanyEmail(
        {
          companyName: customer.company.name,
          sendgridFrom: customer.company.sendgridFrom,
          emailSenderName: customer.company.emailSenderName,
          emailLogoUrl: customer.company.emailLogoUrl,
        },
        {
          companyId: params.companyId,
          to: [customer.email],
          subject: emailSubject,
          text: emailBody,
        }
      );
      await prisma.emailMessage.create({
        data: {
          companyId: params.companyId,
          scope: Scope.EXTERNAL,
          folder: EmailFolder.SENT,
          fromEmail: customer.company.sendgridFrom ?? customer.company.supportEmail ?? "",
          toEmails: [customer.email],
          subject: emailSubject,
          bodyText: emailBody,
          customerId: customer.id,
          userId: params.employeeId ?? null,
          sendgridId: result.messageId,
        },
      });
      emailSentAt = new Date();
      await prisma.pipelineFollowUp.update({ where: { id: followUp.id }, data: { emailSentAt } });
    }

    if (emailSentAt) {
      await recordPipelineEmailThreadActivity({
        followUpId: followUp.id,
        companyId: params.companyId,
        customerId: customer.id,
        phone: customer.phone,
        senderId: params.employeeId ?? null,
        subject: emailSubject,
      });
    }

    return prisma.pipelineFollowUp.update({
      where: { id: followUp.id },
      data: {
        status: PipelineFollowUpStatus.COMPLETED,
        completedAt: new Date(),
        smsSentAt,
        emailSentAt,
        subject: emailSentAt ? emailSubject : null,
        body: emailSentAt ? emailBody : smsBody,
      },
    });
  } catch (error) {
    await prisma.pipelineFollowUp.update({
      where: { id: followUp.id },
      data: { status: PipelineFollowUpStatus.FAILED, lastError: error instanceof Error ? error.message : "Follow-up failed" },
    });
    throw error;
  }
}

export async function skipPipelineFollowUp(params: {
  companyId: string;
  customerId: string;
  stage: ActiveStage;
  sequence: number;
  employeeId: string;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, companyId: params.companyId },
    select: { id: true, pipelineRemovedAt: true },
  });
  if (!customer) throw new Error("Customer not found");
  if (customer.pipelineRemovedAt) throw new Error("Customer is not in the pipeline");

  return prisma.pipelineFollowUp.upsert({
    where: {
      customerId_stage_sequence: {
        customerId: customer.id,
        stage: params.stage,
        sequence: params.sequence,
      },
    },
    create: {
      companyId: params.companyId,
      customerId: customer.id,
      stage: params.stage,
      sequence: params.sequence,
      method: PipelineFollowUpMethod.CALL,
      status: PipelineFollowUpStatus.SKIPPED,
      automated: false,
      performedById: params.employeeId,
      attemptedAt: new Date(),
      completedAt: new Date(),
      body: "Manually checked off",
    },
    update: {
      status: PipelineFollowUpStatus.SKIPPED,
      automated: false,
      performedById: params.employeeId,
      attemptedAt: new Date(),
      completedAt: new Date(),
      scheduledFor: null,
      lastError: null,
      subject: null,
      body: "Manually checked off",
    },
  });
}

export async function processDuePipelineFollowUps(limit = 75) {
  const companies = await prisma.company.findMany({
    where: { pipelineFollowUpsEnabled: true, outboundCommsDisabled: false },
    select: { id: true, name: true, timezone: true, pipelineFollowUpSettings: true, defaultLeadAssignee: { select: { id: true, name: true } } },
  });
  let sent = 0;
  let failed = 0;
  const nowDate = new Date();
  const now = nowDate.getTime();
  for (const company of companies) {
    if (sent + failed >= limit) break;
    const settings = normalizePipelineFollowUpSettings(company.pipelineFollowUpSettings);
    if (!isWithinPipelineFollowUpSendWindow(nowDate, company.timezone, settings)) continue;
    const configuredSender = settings.senderUserId
      ? await prisma.user.findFirst({
          where: { id: settings.senderUserId, companyId: company.id, status: "ACTIVE" },
          select: { id: true, name: true },
        })
      : null;
    const customers = await prisma.customer.findMany({
      where: {
        companyId: company.id,
        pipelineStage: { in: [SalesPipelineStage.LEAD, SalesPipelineStage.QUALIFIED] },
        pipelineRemovedAt: null,
        pipelineDeclinedAt: null,
        pipelineFollowUpsPausedAt: null,
        doNotService: false,
        givingProgramOnly: false,
      },
      select: {
        id: true,
        pipelineLeadId: true,
        pipelineStage: true,
        pipelineLeadAt: true,
        pipelineQualifiedAt: true,
        pipelineFollowUpsResumedAt: true,
        phone: true,
        email: true,
        marketingSmsOptOut: true,
        marketingEmailOptOut: true,
        pipelineFollowUps: {
          where: { status: { in: [PipelineFollowUpStatus.COMPLETED, PipelineFollowUpStatus.SKIPPED] } },
          select: { sequence: true, stage: true },
        },
      },
      take: limit,
    });
    for (const customer of customers) {
      if (sent + failed >= limit) break;
      const stage = customer.pipelineStage as ActiveStage;
      const enteredAt = stageEntryAt(customer, stage);
      if (!enteredAt) continue;
      const automationAnchor = pipelineFollowUpAnchorAt(
        enteredAt,
        customer.pipelineFollowUpsResumedAt
      );
      const completed = new Set(customer.pipelineFollowUps.filter((item) => item.stage === stage).map((item) => item.sequence));
      for (let index = 0; index < 3; index += 1) {
        const sequence = index + 1;
        if (completed.has(sequence)) continue;
        const template = settings[stageKey(stage)][index];
        if (automationAnchor.getTime() + template.delayHours * 3600000 > now) continue;
        const canSms = Boolean(customer.phone && !customer.marketingSmsOptOut);
        const canEmail = Boolean(customer.email && !customer.marketingEmailOptOut);
        if (!canSms && !canEmail) break;
        const method: RequestedMethod = canSms && canEmail ? "SMS_EMAIL" : canSms ? "SMS" : "EMAIL";
        const assignedLead = customer.pipelineLeadId
          ? await prisma.lead.findFirst({
              where: { id: customer.pipelineLeadId, companyId: company.id },
              select: { assignedUser: { select: { id: true, name: true } } },
            })
          : null;
        const employee =
          configuredSender ?? assignedLead?.assignedUser ?? company.defaultLeadAssignee;
        try {
          await sendPipelineFollowUp({
            companyId: company.id,
            customerId: customer.id,
            stage,
            sequence,
            method,
            automated: true,
            employeeId: employee?.id,
            employeeName: employee?.name ?? company.name,
          });
          sent += 1;
        } catch (error) {
          failed += 1;
          console.error("Pipeline follow-up failed", { customerId: customer.id, stage, sequence, error });
        }
        break;
      }
    }
  }
  return { sent, failed };
}
