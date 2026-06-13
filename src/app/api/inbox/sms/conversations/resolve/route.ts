import { NextRequest, NextResponse } from "next/server";
import { Channel, Scope } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const customerId = request.nextUrl.searchParams.get("customerId");
    const phoneParam = request.nextUrl.searchParams.get("phone");

    const or: Array<{ customerId: string } | { participantPhone: string }> = [];
    if (customerId) or.push({ customerId });
    if (phoneParam) or.push({ participantPhone: normalizePhone(phoneParam) });

    if (or.length === 0) {
      return badRequestResponse("customerId or phone is required");
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        companyId: user.companyId,
        channel: Channel.SMS,
        scope: Scope.EXTERNAL,
        OR: or,
      },
      orderBy: { lastMessageAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
    });

    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to resolve conversation" }, { status: 500 });
  }
}
