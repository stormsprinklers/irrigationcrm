import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordCallAnswered } from "@/lib/voice/call-conversion";
import {
  getOperatedCallSession,
  resolveCallSessionForOperator,
} from "@/lib/voice/operated-session";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const callSid = request.nextUrl.searchParams.get("callSid");
    const parentCallSid = request.nextUrl.searchParams.get("parentCallSid");
    if (!callSid && !parentCallSid) {
      return NextResponse.json({ error: "callSid required" }, { status: 400 });
    }

    const session = await resolveCallSessionForOperator(user, callSid, parentCallSid);

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
    let companyId = user.companyId;
    let operatorUserId = user.id;

    if (sessionId) {
      const found = await getOperatedCallSession(user, sessionId);
      if (!found) {
        return NextResponse.json({ error: "sessionId or callSid required" }, { status: 400 });
      }
      companyId = found.session.companyId;
      operatorUserId = found.operatorUserId;
    } else {
      const session = await resolveCallSessionForOperator(user, body.callSid, body.parentCallSid);
      sessionId = session?.id ?? null;
      if (session) {
        companyId = session.companyId;
        operatorUserId = session.operatorUserId;
      }
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
      companyId,
      sessionId,
      userId: operatorUserId,
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
