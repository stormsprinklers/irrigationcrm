import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, badRequestResponse, unauthorizedResponse } from "@/lib/api-auth";
import { blockCustomer, isContactBlocked, unblockCustomer } from "@/lib/inbox/contacts";
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
    const { customerId, phone, email, reason } = body;

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
    if (!id) return badRequestResponse("id required");

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
