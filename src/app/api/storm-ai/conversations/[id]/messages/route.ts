import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { runStormAiTurn } from "@/lib/storm-ai/chat";
import type { StormAiPageContext } from "@/lib/storm-ai/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      content?: string;
      pageContext?: StormAiPageContext;
    };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await runStormAiTurn({
      user,
      conversationId: id,
      content,
      pageContext: body.pageContext ?? null,
    });

    if ("status" in result && result.status === 404) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
