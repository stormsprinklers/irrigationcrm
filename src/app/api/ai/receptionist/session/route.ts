import { NextRequest, NextResponse } from "next/server";
import { ReceptionistCallStatus } from "@prisma/client";
import {
  createToolBearer,
  extractBearer,
  verifyStreamToken,
} from "@/lib/ai-receptionist/auth";
import { buildReceptionistSystemPrompt } from "@/lib/ai-receptionist/prompt";
import {
  AI_RECEPTIONIST_TAG,
  V1_RECEPTIONIST_TOOLS,
  type AiReceptionistNodeConfig,
  type ReceptionistConversationState,
  type ReceptionistToolName,
} from "@/lib/ai-receptionist/types";
import { toolArgSchemas } from "@/lib/ai-receptionist/tools";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { normalizePhone } from "@/lib/inbox/contacts";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  token: z.string().min(10),
});

function openaiToolSchemas(allowed: ReceptionistToolName[]) {
  return allowed.map((name) => {
    const schema = toolArgSchemas[name];
    // Convert zod to a loose JSON schema description for Realtime
    return {
      type: "function" as const,
      name,
      description: `CRM tool: ${name}`,
      parameters: {
        type: "object",
        additionalProperties: true,
        properties: {},
      },
      // Keep zod on server; Realtime gets permissive object + server validates
      _zod: schema,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const claims = verifyStreamToken(parsed.data.token);
    if (!claims) {
      return NextResponse.json({ error: "Invalid or expired stream token" }, { status: 401 });
    }

    const company = await prisma.company.findUnique({
      where: { id: claims.companyId },
      select: {
        id: true,
        name: true,
        timezone: true,
        aiReceptionistEnabled: true,
        aiReceptionistMaxMinutes: true,
        aiReceptionistTone: true,
        aiReceptionistPolicies: true,
        aiReceptionistKnowledge: true,
        businessHours: true,
      },
    });

    if (!company?.aiReceptionistEnabled) {
      return NextResponse.json({ error: "AI receptionist disabled" }, { status: 403 });
    }

    const node = await prisma.callFlowNode.findFirst({
      where: { id: claims.nodeId, flowId: claims.flowId },
    });
    const nodeConfig = (node?.config ?? {}) as AiReceptionistNodeConfig;
    const allowedTools = (
      nodeConfig.allowedTools?.length
        ? nodeConfig.allowedTools.filter((t): t is ReceptionistToolName =>
            (V1_RECEPTIONIST_TOOLS as readonly string[]).includes(t)
          )
        : [...V1_RECEPTIONIST_TOOLS]
    ) as ReceptionistToolName[];

    const fromE164 = normalizePhone(claims.from);
    const matched = await findCustomerByPhone(claims.companyId, fromE164);

    let upcomingJobs: Array<{ id: string; title: string; startAt: string; status: string }> = [];
    let primaryAddress: string | null = null;
    if (matched) {
      const [jobs, property] = await Promise.all([
        prisma.visit.findMany({
          where: {
            companyId: claims.companyId,
            customerId: matched.id,
            status: { not: "CANCELLED" },
            startAt: { gte: new Date() },
          },
          orderBy: { startAt: "asc" },
          take: 5,
          select: { id: true, title: true, startAt: true, status: true },
        }),
        prisma.customerProperty.findFirst({
          where: { customerId: matched.id, companyId: claims.companyId },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        }),
      ]);
      upcomingJobs = jobs.map((j) => ({
        id: j.id,
        title: j.title,
        startAt: j.startAt.toISOString(),
        status: j.status,
      }));
      primaryAddress = [property?.address, property?.city, property?.zip]
        .filter(Boolean)
        .join(", ");
    }

    const conversation: ReceptionistConversationState = {
      customerId: matched?.id ?? null,
      propertyId: null,
    };

    const receptionistCall = await prisma.receptionistCall.upsert({
      where: { callSid: claims.callSid },
      create: {
        companyId: claims.companyId,
        callSid: claims.callSid,
        callSessionId: claims.callSessionId,
        flowId: claims.flowId,
        nodeId: claims.nodeId,
        status: ReceptionistCallStatus.ACTIVE,
        fromE164,
        toE164: claims.to ? normalizePhone(claims.to) : null,
        customerId: matched?.id,
        conversationJson: conversation,
      },
      update: {
        status: ReceptionistCallStatus.ACTIVE,
        flowId: claims.flowId,
        nodeId: claims.nodeId,
        customerId: matched?.id ?? undefined,
      },
    });

    const rawMax = nodeConfig.maxCallMinutes ?? company.aiReceptionistMaxMinutes ?? 12;
    // Clamp: treat accidental huge values as minutes still, never seconds.
    const maxMinutes = Math.min(45, Math.max(5, Number(rawMax) || 12));
    const instructions = buildReceptionistSystemPrompt({
      company: {
        name: company.name,
        timezone: company.timezone,
        tone: company.aiReceptionistTone,
        policies: company.aiReceptionistPolicies,
        knowledge: company.aiReceptionistKnowledge,
      },
      callerPhone: fromE164,
      customer: matched
        ? {
            id: matched.id,
            name: matched.name,
            phone: matched.phone,
            doNotService: matched.doNotService,
            primaryAddress,
            upcomingJobs,
          }
        : null,
      conversation,
      discloseScript: nodeConfig.discloseScript,
      maxCallMinutes: maxMinutes,
    });

    const toolBearer = createToolBearer({
      companyId: claims.companyId,
      callSid: claims.callSid,
      receptionistCallId: receptionistCall.id,
    });

    return NextResponse.json({
      receptionistCallId: receptionistCall.id,
      companyId: claims.companyId,
      callSid: claims.callSid,
      voice: nodeConfig.voice ?? "alloy",
      maxCallMinutes: maxMinutes,
      instructions,
      tools: openaiToolSchemas(allowedTools).map(({ type, name, description, parameters }) => ({
        type,
        name,
        description,
        parameters,
      })),
      toolBearer,
      tag: AI_RECEPTIONIST_TAG,
    });
  } catch (err) {
    console.error("AI receptionist session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Session failed" },
      { status: 500 }
    );
  }
}

/** Optional: allow Authorization stream token instead of body for health checks */
export async function GET(request: NextRequest) {
  const token = extractBearer(request.headers.get("authorization"));
  if (!token || !verifyStreamToken(token)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
