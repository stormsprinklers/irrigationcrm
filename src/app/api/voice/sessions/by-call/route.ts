import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const callSid = request.nextUrl.searchParams.get("callSid");
    if (!callSid) {
      return NextResponse.json({ error: "callSid required" }, { status: 400 });
    }

    const session = await prisma.callSession.findFirst({
      where: { companyId: user.companyId, callSid },
      select: { id: true, status: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch {
    return unauthorizedResponse();
  }
}
