import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";
import { serializePortIn } from "@/lib/twilio/port-in-service";
import {
  checkPortability,
  createPortInRequest,
  ensurePortingWebhookConfigured,
  isTollFreeNumberType,
  isUsLocalE164,
  normalizePortStatus,
  pickPrimaryPhoneNumber,
  pinRequiredForPort,
  type LosingCarrierInformation,
} from "@/lib/twilio/porting";

function requireString(value: unknown, label: string) {
  const s = String(value ?? "").trim();
  if (!s) throw new Error(`${label} is required`);
  return s;
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.twilioPortInRequest.findMany({
      where: { companyId: user.companyId },
      include: {
        phoneNumber: { select: { id: true, e164: true, isPrimary: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        name: true,
        legalName: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        phone: true,
        supportEmail: true,
      },
    });

    return NextResponse.json({
      ports: rows.map(serializePortIn),
      defaults: {
        customerName: company?.legalName || company?.name || "",
        accountTelephoneNumber: company?.phone
          ? normalizePhone(company.phone)
          : "",
        street: company?.address ?? "",
        city: company?.city ?? "",
        state: company?.state ?? "",
        zip: company?.zip ?? "",
        country: "US",
        notificationEmails: [
          user.email,
          company?.supportEmail,
        ].filter((e): e is string => Boolean(e && e.includes("@"))),
        authorizedRepresentative: user.name || "",
        authorizedRepresentativeEmail: user.email || "",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Failed to list port requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const e164 = normalizePhone(requireString(body.e164 ?? body.phoneNumber, "Phone number"));
    if (!isUsLocalE164(e164)) {
      return NextResponse.json(
        { error: "Only US local/mobile numbers are supported in this wizard" },
        { status: 400 }
      );
    }

    const documentSid = requireString(body.documentSid, "Utility bill document");
    const pin = body.pin ? String(body.pin).trim() : null;
    const targetPortInDate = requireString(body.targetPortInDate, "Target port date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetPortInDate)) {
      return NextResponse.json(
        { error: "Target port date must be YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const target = new Date(`${targetPortInDate}T12:00:00Z`);
    const soonest = new Date();
    soonest.setUTCDate(soonest.getUTCDate() + 5);
    if (target < soonest) {
      return NextResponse.json(
        {
          error:
            "Choose a target date at least 5 days out. Carriers typically need 5–7+ business days.",
        },
        { status: 400 }
      );
    }

    const emailsRaw: unknown[] = Array.isArray(body.notificationEmails)
      ? body.notificationEmails
      : String(body.notificationEmails ?? "")
          .split(",")
          .map((s: string) => s.trim());
    const notificationEmails: string[] = [
      ...new Set(
        emailsRaw
          .map((e) => String(e ?? "").trim().toLowerCase())
          .filter((e) => e.includes("@"))
      ),
    ];
    if (!notificationEmails.length) {
      return NextResponse.json(
        { error: "At least one notification email is required" },
        { status: 400 }
      );
    }

    const customerType =
      body.customerType === "Individual" ? "Individual" : "Business";
    const losingCarrier: LosingCarrierInformation = {
      customer_type: customerType,
      customer_name: requireString(body.customerName, "Customer name"),
      account_number: requireString(body.accountNumber, "Account number"),
      account_telephone_number: normalizePhone(
        requireString(body.accountTelephoneNumber, "Account telephone number")
      ),
      authorized_representative: requireString(
        body.authorizedRepresentative,
        "Authorized representative name"
      ),
      authorized_representative_email: requireString(
        body.authorizedRepresentativeEmail,
        "Authorized representative email"
      ).toLowerCase(),
      address: {
        street: requireString(body.street, "Billing street"),
        street_2: body.street2 ? String(body.street2).trim() : null,
        city: requireString(body.city, "Billing city"),
        state: requireString(body.state, "Billing state"),
        zip: requireString(body.zip, "Billing ZIP"),
        country: "US",
      },
    };

    const portability = await checkPortability(e164);
    if (isTollFreeNumberType(portability.numberType)) {
      return NextResponse.json(
        {
          error:
            "Toll-free numbers cannot be ported through this wizard. Use Twilio Console or Support.",
        },
        { status: 400 }
      );
    }
    if (!portability.portable) {
      return NextResponse.json(
        {
          error:
            portability.notPortableReason ||
            "This number is not portable via the automated Porting API",
          notPortableReason: portability.notPortableReason,
        },
        { status: 400 }
      );
    }

    const pinRequired = pinRequiredForPort(
      portability.pinAndAccountNumberRequired,
      portability.numberType
    );
    if (pinRequired && !pin) {
      return NextResponse.json(
        {
          error:
            "A PIN from your losing carrier is required for this mobile/number type",
        },
        { status: 400 }
      );
    }

    await ensurePortingWebhookConfigured();

    const created = await createPortInRequest({
      phoneNumber: e164,
      pin,
      documentSid,
      losingCarrier,
      notificationEmails,
      targetPortInDate,
      targetPortInTimeRangeStart: body.targetPortInTimeRangeStart
        ? String(body.targetPortInTimeRangeStart)
        : null,
      targetPortInTimeRangeEnd: body.targetPortInTimeRangeEnd
        ? String(body.targetPortInTimeRangeEnd)
        : null,
    });

    const pn = pickPrimaryPhoneNumber(created);
    const status =
      normalizePortStatus(pn?.port_in_phone_number_status) !== "Unknown"
        ? normalizePortStatus(pn?.port_in_phone_number_status)
        : normalizePortStatus(created.port_in_request_status);

    const row = await prisma.twilioPortInRequest.create({
      data: {
        companyId: user.companyId,
        createdByUserId: user.id,
        e164,
        twilioPortInRequestSid: created.port_in_request_sid,
        twilioPortInPhoneNumberSid: pn?.port_in_phone_number_sid ?? null,
        twilioDocumentSid: documentSid,
        status,
        portable: pn?.portable ?? portability.portable,
        losingCarrierJson: losingCarrier as unknown as Prisma.InputJsonValue,
        notificationEmails,
        targetPortInDate: target,
        targetPortInTimeRangeStart: body.targetPortInTimeRangeStart
          ? String(body.targetPortInTimeRangeStart)
          : null,
        targetPortInTimeRangeEnd: body.targetPortInTimeRangeEnd
          ? String(body.targetPortInTimeRangeEnd)
          : null,
      },
      include: {
        phoneNumber: { select: { id: true, e164: true, isPrimary: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(serializePortIn(row), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Failed to create port-in request";
    const status =
      error instanceof Error &&
      (message.includes("required") || message.includes("must be"))
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
