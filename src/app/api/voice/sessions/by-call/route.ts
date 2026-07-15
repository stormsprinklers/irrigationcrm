import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordCallAnswered } from "@/lib/voice/call-conversion";
import { resolveCallSessionBySids } from "@/lib/voice/resolve-session";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const callSid = request.nextUrl.searchParams.get("callSid");
    const parentCallSid = request.nextUrl.searchParams.get("parentCallSid");
    if (!callSid && !parentCallSid) {
      return NextResponse.json({ error: "callSid required" }, { status: 400 });
    }

    const session = await resolveCallSessionBySids(
      user.companyId,
      callSid,
      parentCallSid
    );

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch {
    return unauthorizedResponse();
  }
}

/** CSR answered this inbound call (softphone accept) or connected outbound. */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json().catch(() => ({}))) as {
      callSid?: string;
      parentCallSid?: string;
      sessionId?: string;
      agentCallSid?: string;
      answered?: boolean;
    };

    let sessionId = body.sessionId?.trim() || null;
    if (!sessionId) {
      const session = await resolveCallSessionBySids(
        user.companyId,
        body.callSid,
        body.parentCallSid
      );
      sessionId = session?.id ?? null;
    }

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId or callSid required" }, { status: 400 });
    }

    if (body.answered === false) {
      return NextResponse.json({ ok: true });
    }

    const agentCallSid = body.agentCallSid?.trim() || body.callSid?.trim() || null;
    if (agentCallSid) {
      await prisma.callSession.update({
        where: { id: sessionId },
        data: { agentCallSid },
      });
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
