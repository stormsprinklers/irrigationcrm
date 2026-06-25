import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenForFieldRole,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { formatContactName, withDefaultPhone } from "@/lib/inbox/contact-info-types";
import { ensureMessageContactInfoParsed } from "@/lib/inbox/contact-info-process";
import { normalizePhone } from "@/lib/inbox/contacts";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ messageId: string }> };

async function loadMessageForCompany(messageId: string, companyId: string) {
  return prisma.message.findFirst({
    where: {
      id: messageId,
      conversation: { companyId, channel: "SMS", scope: "EXTERNAL" },
    },
    include: {
      conversation: {
        select: {
          id: true,
          customerId: true,
          participantPhone: true,
          title: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
            },
          },
        },
      },
    },
  });
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { messageId } = await params;

    const message = await loadMessageForCompany(messageId, user.companyId);
    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!message.contactInfoDetected) {
      return NextResponse.json({ error: "Contact info not detected on this message" }, { status: 400 });
    }

    const fallbackPhone = message.conversation.participantPhone;
    const parsed = await ensureMessageContactInfoParsed(messageId, fallbackPhone);
    if (!parsed) {
      return NextResponse.json({ error: "Could not parse contact info" }, { status: 500 });
    }

    return NextResponse.json({
      messageId: message.id,
      conversationId: message.conversation.id,
      customerId: message.conversation.customerId,
      customer: message.conversation.customer,
      parsed: withDefaultPhone(parsed, fallbackPhone),
      fallbackPhone,
      appliedAt: message.contactInfoAppliedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
      return NextResponse.json({ error: "OpenAI is not configured" }, { status: 503 });
    }
    console.error("Contact info GET error:", error);
    return NextResponse.json({ error: "Failed to load contact info" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role);
    if (fieldDenied) return fieldDenied;

    const { messageId } = await params;
    const body = await request.json();

    const message = await loadMessageForCompany(messageId, user.companyId);
    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!message.contactInfoDetected) {
      return badRequestResponse("Contact info not detected on this message");
    }
    if (message.contactInfoAppliedAt) {
      return badRequestResponse("Contact info already applied from this message");
    }

    const firstName = body.firstName != null ? String(body.firstName).trim() : "";
    const lastName = body.lastName != null ? String(body.lastName).trim() : "";
    const homeAddress = body.homeAddress != null ? String(body.homeAddress).trim() : "";
    const email = body.email != null ? String(body.email).trim().toLowerCase() : "";
    const phoneRaw =
      body.phone != null && String(body.phone).trim()
        ? String(body.phone).trim()
        : message.conversation.participantPhone ?? "";
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

    const name =
      [firstName, lastName].filter(Boolean).join(" ").trim() ||
      message.conversation.customer?.name ||
      message.conversation.title ||
      (phone ? formatPhoneDisplay(phone) : "Customer");

    if (!email && !phone && !homeAddress && name === "Customer") {
      return badRequestResponse("Add at least one contact field");
    }

    let customerId = message.conversation.customerId;

    if (customerId) {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          name,
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          ...(homeAddress ? { address: homeAddress } : {}),
        },
      });
    } else {
      const customer = await prisma.customer.create({
        data: {
          companyId: user.companyId,
          name,
          phone,
          email: email || null,
          address: homeAddress || null,
          leadSource: "SMS",
        },
      });
      customerId = customer.id;
      await prisma.conversation.update({
        where: { id: message.conversation.id },
        data: { customerId },
      });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        contactInfoAppliedAt: new Date(),
        parsedContactInfo: {
          firstName: firstName || null,
          lastName: lastName || null,
          homeAddress: homeAddress || null,
          email: email || null,
          phone,
        },
      },
    });

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true, email: true, address: true },
    });

    return NextResponse.json({
      ok: true,
      customer,
      displayName: formatContactName({
        firstName: firstName || null,
        lastName: lastName || null,
        homeAddress: null,
        email: null,
        phone: null,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Contact info apply error:", error);
    return NextResponse.json({ error: "Failed to apply contact info" }, { status: 500 });
  }
}
