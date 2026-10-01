import { Channel, MessageDirection, Prisma, Scope } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { fieldCustomerCommsWhere } from "@/lib/field/access";
import { WEBSITE_FORM_SMS_BODY_STARTS_WITH } from "@/lib/inbox/website-leads";
import { prisma } from "@/lib/prisma";

type MarkAllReadBody = {
  scope?: "external" | "internal";
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = (await request.json().catch(() => ({}))) as MarkAllReadBody;
    if (body.scope !== "external" && body.scope !== "internal") {
      return badRequestResponse("A valid SMS inbox scope is required");
    }

    const scope = body.scope === "internal" ? Scope.INTERNAL : Scope.EXTERNAL;
    const fieldCommsWhere =
      scope === Scope.EXTERNAL ? await fieldCustomerCommsWhere(user) : null;
    const conversationWhere: Prisma.ConversationWhereInput = {
      companyId: user.companyId,
      channel: Channel.SMS,
      scope,
      ...(fieldCommsWhere ?? {}),
    };

    const result = await prisma.message.updateMany({
      where: {
        direction: MessageDirection.INBOUND,
        readAt: null,
        NOT: { body: { startsWith: WEBSITE_FORM_SMS_BODY_STARTS_WITH } },
        conversation: conversationWhere,
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ updatedCount: result.count });
  } catch {
    return unauthorizedResponse();
  }
}
