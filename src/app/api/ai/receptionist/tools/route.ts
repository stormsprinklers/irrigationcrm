import { NextRequest, NextResponse } from "next/server";
import { extractBearer, verifyToolBearer } from "@/lib/ai-receptionist/auth";
import {
  executeReceptionistTool,
  type ToolContext,
} from "@/lib/ai-receptionist/tools";
import { V1_RECEPTIONIST_TOOLS, type ReceptionistToolName } from "@/lib/ai-receptionist/types";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  tool: z.string(),
  arguments: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const bearer = extractBearer(request.headers.get("authorization"));
    if (!bearer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const claims = verifyToolBearer(bearer);
    if (!claims) {
      return NextResponse.json({ error: "Invalid or expired tool token" }, { status: 401 });
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "tool and arguments required" }, { status: 400 });
    }

    if (!(V1_RECEPTIONIST_TOOLS as readonly string[]).includes(parsed.data.tool)) {
      return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
    }

    const call = await prisma.receptionistCall.findFirst({
      where: {
        id: claims.receptionistCallId,
        companyId: claims.companyId,
        callSid: claims.callSid,
      },
    });
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const ctx: ToolContext = {
      companyId: claims.companyId,
      callSid: claims.callSid,
      receptionistCallId: claims.receptionistCallId,
      fromE164: call.fromE164,
    };

    const result = await executeReceptionistTool(
      ctx,
      parsed.data.tool as ReceptionistToolName,
      parsed.data.arguments ?? {}
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error("AI receptionist tool error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Tool failed" },
      { status: 500 }
    );
  }
}
