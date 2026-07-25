import { AppNotificationType, PhoneNumberType, UserRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/inbox/contacts";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";
import { configureNumberWebhooks, listAccountNumbers } from "@/lib/twilio/numbers";
import {
  getPortInRequest,
  isTerminalPortStatus,
  normalizePortStatus,
  pickPrimaryPhoneNumber,
  type PortInRequest,
} from "@/lib/twilio/porting";
import { syncCompanyTwilioPhone } from "@/lib/voice/company-phone";

export { isTerminalPortStatus };

export function serializePortIn(row: {
  id: string;
  companyId: string;
  e164: string;
  twilioPortInRequestSid: string;
  twilioPortInPhoneNumberSid: string | null;
  twilioDocumentSid: string | null;
  status: string;
  portable: boolean | null;
  rejectionReason: string | null;
  rejectionReasonCode: string | null;
  notPortableReason: string | null;
  losingCarrierJson: Prisma.JsonValue | null;
  notificationEmails: string[];
  targetPortInDate: Date | null;
  targetPortInTimeRangeStart: string | null;
  targetPortInTimeRangeEnd: string | null;
  phoneNumberId: string | null;
  createdAt: Date;
  updatedAt: Date;
  phoneNumber?: { id: string; e164: string; isPrimary: boolean } | null;
  createdBy?: { id: string; name: string; email: string } | null;
}) {
  return {
    id: row.id,
    companyId: row.companyId,
    e164: row.e164,
    twilioPortInRequestSid: row.twilioPortInRequestSid,
    twilioPortInPhoneNumberSid: row.twilioPortInPhoneNumberSid,
    twilioDocumentSid: row.twilioDocumentSid,
    status: row.status,
    portable: row.portable,
    rejectionReason: row.rejectionReason,
    rejectionReasonCode: row.rejectionReasonCode,
    notPortableReason: row.notPortableReason,
    losingCarrier: row.losingCarrierJson,
    notificationEmails: row.notificationEmails,
    targetPortInDate: row.targetPortInDate?.toISOString().slice(0, 10) ?? null,
    targetPortInTimeRangeStart: row.targetPortInTimeRangeStart,
    targetPortInTimeRangeEnd: row.targetPortInTimeRangeEnd,
    phoneNumberId: row.phoneNumberId,
    phoneNumber: row.phoneNumber ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isTerminal: isTerminalPortStatus(row.status),
  };
}

export function applyTwilioPortInToRow(request: PortInRequest) {
  const pn = pickPrimaryPhoneNumber(request);
  const status =
    normalizePortStatus(pn?.port_in_phone_number_status) !== "Unknown"
      ? normalizePortStatus(pn?.port_in_phone_number_status)
      : normalizePortStatus(request.port_in_request_status);

  return {
    status,
    portable: pn?.portable ?? null,
    rejectionReason: pn?.rejection_reason ? String(pn.rejection_reason) : null,
    rejectionReasonCode:
      pn?.rejection_reason_code != null ? String(pn.rejection_reason_code) : null,
    notPortableReason:
      pn?.not_portable_reason || pn?.not_portability_reason
        ? String(pn.not_portable_reason || pn.not_portability_reason)
        : null,
    twilioPortInPhoneNumberSid: pn?.port_in_phone_number_sid ?? null,
  };
}

export async function refreshPortInFromTwilio(companyId: string, id: string) {
  const row = await prisma.twilioPortInRequest.findFirst({
    where: { id, companyId },
    include: {
      phoneNumber: { select: { id: true, e164: true, isPrimary: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!row) return null;

  const remote = await getPortInRequest(row.twilioPortInRequestSid);
  const patch = applyTwilioPortInToRow(remote);
  const updated = await prisma.twilioPortInRequest.update({
    where: { id: row.id },
    data: patch,
    include: {
      phoneNumber: { select: { id: true, e164: true, isPrimary: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (isCompletedPhoneStatus(patch.status) && !updated.phoneNumberId) {
    await importCompletedPortNumber(updated.id);
    return prisma.twilioPortInRequest.findFirst({
      where: { id: updated.id },
      include: {
        phoneNumber: { select: { id: true, e164: true, isPrimary: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  return updated;
}

function isCompletedPhoneStatus(status: string) {
  return status.toLowerCase().replace(/_/g, " ").includes("completed");
}

export async function importCompletedPortNumber(portInId: string) {
  const row = await prisma.twilioPortInRequest.findUnique({
    where: { id: portInId },
  });
  if (!row || row.phoneNumberId) return row;

  const e164 = normalizePhone(row.e164);
  const accountNumbers = await listAccountNumbers();
  const match = accountNumbers.find((n) => normalizePhone(n.e164) === e164);
  if (!match) {
    console.warn("[porting] completed but IncomingPhoneNumber not found yet", e164);
    return row;
  }

  try {
    await configureNumberWebhooks(match.sid);
  } catch (err) {
    console.error("[porting] webhook config failed", match.sid, err);
  }

  const existing = await prisma.phoneNumber.findFirst({
    where: { companyId: row.companyId, e164 },
  });

  const primaryCount = await prisma.phoneNumber.count({
    where: { companyId: row.companyId, isPrimary: true },
  });
  const makePrimary = primaryCount === 0;

  const phone = existing
    ? await prisma.phoneNumber.update({
        where: { id: existing.id },
        data: {
          twilioSid: match.sid,
          friendlyName: existing.friendlyName ?? match.friendlyName ?? null,
          ...(makePrimary
            ? { isPrimary: true, numberType: PhoneNumberType.PRIMARY }
            : {}),
        },
      })
    : await prisma.phoneNumber.create({
        data: {
          companyId: row.companyId,
          e164,
          friendlyName: match.friendlyName ?? null,
          twilioSid: match.sid,
          numberType: makePrimary ? PhoneNumberType.PRIMARY : PhoneNumberType.TRACKING,
          isPrimary: makePrimary,
        },
      });

  if (makePrimary) {
    await syncCompanyTwilioPhone(row.companyId, e164).catch(() => undefined);
  }

  const updated = await prisma.twilioPortInRequest.update({
    where: { id: row.id },
    data: {
      phoneNumberId: phone.id,
      status: "Completed",
    },
  });

  const admins = await prisma.user.findMany({
    where: {
      companyId: row.companyId,
      status: "ACTIVE",
      role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
    },
    select: { id: true },
  });
  if (admins.length) {
    await notifyStaffInApp({
      companyId: row.companyId,
      type: AppNotificationType.SYNC_FAILED,
      title: "Phone number port completed",
      body: `${e164} is now on Twilio and configured in the CRM.`,
      href: "/settings/voice/numbers?tab=port",
      userIds: admins.map((a) => a.id),
    }).catch(() => undefined);
  }

  return updated;
}

export async function handlePortingWebhookPayload(body: {
  port_in_request_sid?: string;
  port_in_phone_number_sid?: string | null;
  phone_number?: string | null;
  status?: string | null;
  portable?: string | boolean | null;
  not_portable_reason?: string | null;
  not_portable_reason_code?: string | number | null;
  rejection_reason?: string | null;
  rejection_reason_code?: string | number | null;
}) {
  const sid = body.port_in_request_sid;
  if (!sid) return { ok: false as const, reason: "missing sid" };

  const row = await prisma.twilioPortInRequest.findFirst({
    where: { twilioPortInRequestSid: sid },
  });
  if (!row) {
    console.warn("[porting] webhook for unknown PortIn SID", sid);
    return { ok: false as const, reason: "not found" };
  }

  const status = normalizePortStatus(body.status ?? row.status);
  const portable =
    body.portable === true ||
    body.portable === "true" ||
    (body.portable == null ? row.portable : false);

  await prisma.twilioPortInRequest.update({
    where: { id: row.id },
    data: {
      status,
      portable,
      twilioPortInPhoneNumberSid:
        body.port_in_phone_number_sid || row.twilioPortInPhoneNumberSid,
      rejectionReason: body.rejection_reason
        ? String(body.rejection_reason)
        : row.rejectionReason,
      rejectionReasonCode:
        body.rejection_reason_code != null
          ? String(body.rejection_reason_code)
          : row.rejectionReasonCode,
      notPortableReason: body.not_portable_reason
        ? String(body.not_portable_reason)
        : row.notPortableReason,
    },
  });

  if (isCompletedPhoneStatus(status) && !row.phoneNumberId) {
    await importCompletedPortNumber(row.id);
  }

  const needsAction =
    status.toLowerCase().includes("action required") ||
    status.toLowerCase().includes("rejected");
  if (needsAction) {
    await notifyStaffInApp({
      companyId: row.companyId,
      type: AppNotificationType.SYNC_FAILED,
      title: "Phone number port needs attention",
      body:
        body.rejection_reason ||
        body.not_portable_reason ||
        `${row.e164} port status: ${status}`,
      href: "/settings/voice/numbers?tab=port",
    }).catch(() => undefined);
  }

  return { ok: true as const };
}
