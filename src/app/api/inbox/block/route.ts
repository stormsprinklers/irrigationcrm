import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, badRequestResponse, unauthorizedResponse } from "@/lib/api-auth";
import { blockCustomer, isContactBlocked, normalizePhone, unblockCustomer } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const blocked = await prisma.blockedContact.findMany({
      where: { companyId: user.companyId },
      include: { customer: true },
      orderBy: { blockedAt: "desc" },
    });
    return NextResponse.json(blocked);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { customerId, phone, email, reason, spam } = body;

    if (spam) {
      if (!phone || typeof phone !== "string") return badRequestResponse("Phone required for SMS spam");
      const normalizedPhone = normalizePhone(phone);
      const existing = await prisma.blockedContact.findFirst({ where: { companyId: user.companyId, phone: normalizedPhone } });
      if (existing) {
        const blocked = await prisma.blockedContact.update({
          where: { id: existing.id },
          data: {
            blockedBy: user.id,
            blockedAt: new Date(),
            reason: "SMS spam",
          },
        });
        return NextResponse.json(blocked);
      }
      const blocked = await blockCustomer({ companyId: user.companyId, blockedBy: user.id, phone: normalizedPhone, reason: "SMS spam" });
      return NextResponse.json(blocked);
    }

    if (!customerId && !phone && !email) {
      return badRequestResponse("customerId, phone, or email required");
    }

    let resolvedPhone = phone;
    let resolvedEmail = email;

    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, companyId: user.companyId },
      });
      if (!customer) return badRequestResponse("Customer not found");
      resolvedPhone = customer.phone;
      resolvedEmail = customer.email;
    }

    const blocked = await blockCustomer({
      companyId: user.companyId,
      blockedBy: user.id,
      customerId,
      phone: resolvedPhone,
      email: resolvedEmail,
      reason,
    });

    return NextResponse.json(blocked);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const phone = searchParams.get("phone");
    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      const entries = await prisma.blockedContact.findMany({ where: { companyId: user.companyId, phone: normalizedPhone } });
      await prisma.$transaction(entries.map((entry) =>
        entry.email
          ? prisma.blockedContact.update({ where: { id: entry.id }, data: { phone: null, customerId: null } })
          : prisma.blockedContact.delete({ where: { id: entry.id } })
      ));
      return NextResponse.json({ success: true });
    }
    if (!id) return badRequestResponse("id or phone required");

    await unblockCustomer(user.companyId, id);
    return NextResponse.json({ success: true });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { phone, email } = body;

    const blocked = await isContactBlocked(user.companyId, phone, email);
    return NextResponse.json({ blocked });
  } catch {
    return unauthorizedResponse();
  }
}
