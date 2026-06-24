import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    let conversation = await prisma.conversation.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            doNotService: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!conversation.customerId && conversation.participantPhone) {
      const customer = await findCustomerByPhone(
        user.companyId,
        conversation.participantPhone
      );
      if (customer) {
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: { customerId: customer.id },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                doNotService: true,
              },
            },
          },
        });
      }
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      include: { sender: { select: { id: true, name: true, email: true } } },
      orderBy: { sentAt: "asc" },
    });

    return NextResponse.json({ conversation, messages });
  } catch {
    return unauthorizedResponse();
  }
}
