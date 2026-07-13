import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordCallAnswered } from "@/lib/voice/call-conversion";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const callSid = request.nextUrl.searchParams.get("callSid");
    if (!callSid) {
      return NextResponse.json({ error: "callSid required" }, { status: 400 });
    }

    const session = await prisma.callSession.findFirst({
      where: { companyId: user.companyId, callSid },
      select: { id: true, status: true, assignedUserId: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch {
    return unauthorizedResponse();
  }
}

/** CSR answered this inbound call (softphone accept). */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json().catch(() => ({}))) as {
      callSid?: string;
      sessionId?: string;
      answered?: boolean;
    };

    let sessionId = body.sessionId?.trim() || null;
    if (!sessionId && body.callSid) {
      const session = await prisma.callSession.findFirst({
        where: { companyId: user.companyId, callSid: body.callSid },
        select: { id: true },
      });
      sessionId = session?.id ?? null;
    }

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId or callSid required" }, { status: 400 });
    }

    if (body.answered === false) {
      return NextResponse.json({ ok: true });
    }

    const conversion = await recordCallAnswered({
      companyId: user.companyId,
      sessionId,
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      sessionId,
      conversionId: conversion?.id ?? null,
    });
  } catch {
    return unauthorizedResponse();
  }
}
