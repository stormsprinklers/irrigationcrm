import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { storeStormAiRealtimeFrame } from "@/lib/storm-ai/realtime-frame";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: string;
      visitId?: string;
      dataUrl?: string;
      fileName?: string;
    };

    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (!conversationId || !dataUrl) {
      return NextResponse.json(
        { error: "conversationId and dataUrl are required" },
        { status: 400 }
      );
    }

    const result = await storeStormAiRealtimeFrame({
      user,
      conversationId,
      dataUrl,
      visitId: typeof body.visitId === "string" ? body.visitId : null,
      fileName: typeof body.fileName === "string" ? body.fileName : undefined,
    });

    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
