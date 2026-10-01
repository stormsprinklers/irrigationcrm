import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenForFieldRole,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { formatContactName, withDefaultPhone } from "@/lib/inbox/contact-info-types";
import { ensureMessageContactInfoParsed } from "@/lib/inbox/contact-info-process";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { normalizePhone } from "@/lib/inbox/contacts";
import { formatPhoneDisplay, phonesMatch } from "@/lib/inbox/phone";
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
              phones: { select: { id: true, phone: true, note: true } },
              emails: { select: { id: true, email: true, note: true } },
            },
          },
        },
      },
    },
  });
}

type LoadedMessage = NonNullable<Awaited<ReturnType<typeof loadMessageForCompany>>>;

async function resolveTargetCustomer(message: LoadedMessage, companyId: string) {
  if (message.conversation.customer) return message.conversation.customer;
  const participantPhone = message.conversation.participantPhone;
  if (!participantPhone) return null;

  const matched = await findCustomerByPhone(companyId, participantPhone);
  if (!matched) return null;
  return prisma.customer.findFirst({
    where: { id: matched.id, companyId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      phones: { select: { id: true, phone: true, note: true } },
      emails: { select: { id: true, email: true, note: true } },
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

    const targetCustomer = await resolveTargetCustomer(message, user.companyId);

    return NextResponse.json({
      messageId: message.id,
      conversationId: message.conversation.id,
      customerId: targetCustomer?.id ?? null,
      customer: targetCustomer,
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

    const detectedName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const targetCustomer = await resolveTargetCustomer(message, user.companyId);
    const name =
      detectedName ||
      targetCustomer?.name ||
      message.conversation.title ||
      (phone ? formatPhoneDisplay(phone) : "Customer");

    if (!email && !phone && !homeAddress && name === "Customer") {
      return badRequestResponse("Add at least one contact field");
    }

    const actions =
      body.fieldActions && typeof body.fieldActions === "object"
        ? (body.fieldActions as Record<string, unknown>)
        : {};
    const actionFor = (field: string) =>
      typeof actions[field] === "string" ? String(actions[field]) : "";
    const sameText = (left: string | null | undefined, right: string | null | undefined) =>
      String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();

    const phoneAlreadySaved = Boolean(
      phone &&
        (phonesMatch(targetCustomer?.phone, phone) ||
          targetCustomer?.phones.some((entry) => phonesMatch(entry.phone, phone)))
    );
    const emailAlreadySaved = Boolean(
      email &&
        (sameText(targetCustomer?.email, email) ||
          targetCustomer?.emails.some((entry) => sameText(entry.email, email)))
    );
    const conflicts = targetCustomer
      ? {
          name: Boolean(detectedName && !sameText(targetCustomer.name, detectedName)),
          phone: Boolean(phone && targetCustomer.phone && !phoneAlreadySaved),
          email: Boolean(email && targetCustomer.email && !emailAlreadySaved),
          address: Boolean(
            homeAddress && targetCustomer.address && !sameText(targetCustomer.address, homeAddress)
          ),
        }
      : { name: false, phone: false, email: false, address: false };

    const allowedActions: Record<keyof typeof conflicts, string[]> = {
      name: ["keep", "replace"],
      phone: ["keep", "replace", "secondary"],
      email: ["keep", "replace", "secondary"],
      address: ["keep", "replace", "secondary"],
    };
    const unresolved = Object.entries(conflicts)
      .filter(([, conflict]) => conflict)
      .map(([field]) => field as keyof typeof conflicts)
      .filter((field) => !allowedActions[field].includes(actionFor(field)));
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: `Confirm how to handle the existing ${unresolved.join(", ")} field${unresolved.length === 1 ? "" : "s"}.`,
          conflicts,
        },
        { status: 409 }
      );
    }

    const customerId = await prisma.$transaction(async (tx) => {
      let resolvedCustomerId: string;
      if (targetCustomer) {
        resolvedCustomerId = targetCustomer.id;
        const data: { name?: string; phone?: string; email?: string; address?: string } = {};
        if (detectedName && (!conflicts.name || actionFor("name") === "replace")) {
          data.name = detectedName;
        }

        if (phone && !phoneAlreadySaved) {
          if (!targetCustomer.phone || actionFor("phone") === "replace") {
            if (targetCustomer.phone && actionFor("phone") === "replace") {
              const oldPhone = normalizePhone(targetCustomer.phone);
              const existingOld = await tx.customerPhone.findFirst({
                where: { customerId: targetCustomer.id, phone: oldPhone },
                select: { id: true },
              });
              if (!existingOld) {
                await tx.customerPhone.create({
                  data: {
                    companyId: user.companyId,
                    customerId: targetCustomer.id,
                    phone: oldPhone,
                    note: "Previous primary phone",
                  },
                });
              }
            }
            data.phone = phone;
          } else if (actionFor("phone") === "secondary") {
            const existingPhone = await tx.customerPhone.findFirst({
              where: { customerId: targetCustomer.id, phone },
              select: { id: true },
            });
            if (!existingPhone) {
              await tx.customerPhone.create({
                data: {
                  companyId: user.companyId,
                  customerId: targetCustomer.id,
                  phone,
                  note: "Added from SMS",
                },
              });
            }
          }
        }

        if (email && !emailAlreadySaved) {
          if (!targetCustomer.email || actionFor("email") === "replace") {
            if (targetCustomer.email && actionFor("email") === "replace") {
              const oldEmail = targetCustomer.email.trim().toLowerCase();
              await tx.customerEmail.upsert({
                where: { customerId_email: { customerId: targetCustomer.id, email: oldEmail } },
                create: {
                  companyId: user.companyId,
                  customerId: targetCustomer.id,
                  email: oldEmail,
                  note: "Previous primary email",
                },
                update: {},
              });
            }
            data.email = email;
          } else if (actionFor("email") === "secondary") {
            await tx.customerEmail.upsert({
              where: { customerId_email: { customerId: targetCustomer.id, email } },
              create: {
                companyId: user.companyId,
                customerId: targetCustomer.id,
                email,
                note: "Added from SMS",
              },
              update: {},
            });
          }
        }

        if (homeAddress && (!targetCustomer.address || actionFor("address") === "replace")) {
          data.address = homeAddress;
        } else if (homeAddress && actionFor("address") === "secondary") {
          const existingProperty = await tx.customerProperty.findFirst({
            where: {
              customerId: targetCustomer.id,
              address: { equals: homeAddress, mode: "insensitive" },
            },
            select: { id: true },
          });
          if (!existingProperty) {
            await tx.customerProperty.create({
              data: {
                companyId: user.companyId,
                customerId: targetCustomer.id,
                name: "Additional address",
                address: homeAddress,
                isPrimary: false,
              },
            });
          }
        }

        if (Object.keys(data).length > 0) {
          await tx.customer.update({ where: { id: targetCustomer.id }, data });
        }
      } else {
        const customer = await tx.customer.create({
          data: {
            companyId: user.companyId,
            name,
            phone,
            email: email || null,
            address: homeAddress || null,
            leadSource: "SMS",
          },
        });
        resolvedCustomerId = customer.id;
      }

      if (message.conversation.customerId !== resolvedCustomerId) {
        await tx.conversation.update({
          where: { id: message.conversation.id },
          data: { customerId: resolvedCustomerId },
        });
      }

      await tx.message.update({
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

      return resolvedCustomerId;
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
