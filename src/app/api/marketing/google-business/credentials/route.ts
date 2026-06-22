import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { getGbpConnectionStatus } from "@/lib/google-business/client";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const body = await request.json();
    const clientId =
      body.clientId !== undefined ? String(body.clientId).trim() || null : undefined;
    const clientSecret =
      body.clientSecret !== undefined ? String(body.clientSecret).trim() || null : undefined;

    if (clientId === undefined && clientSecret === undefined) {
      return NextResponse.json({ error: "No credentials provided" }, { status: 400 });
    }

    await prisma.company.update({
      where: { id: user.companyId },
      data: {
        ...(clientId !== undefined ? { googleBusinessOAuthClientId: clientId } : {}),
        ...(clientSecret !== undefined ? { googleBusinessOAuthClientSecret: clientSecret } : {}),
      },
    });

    const status = await getGbpConnectionStatus(user.companyId);
    return NextResponse.json(status);
  } catch {
    return unauthorizedResponse();
  }
}
