import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { runStormAiTurn } from "@/lib/storm-ai/chat";
import type { StormAiPageContext } from "@/lib/storm-ai/types";

export const maxDuration = 90;

type Params = { params: Promise<{ id: string }> };

type ImageBody = {
  dataUrl?: string;
  blobUrl?: string;
  mimeType?: string;
  fileName?: string;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      content?: string;
      images?: ImageBody[];
      pageContext?: StormAiPageContext;
    };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const images = Array.isArray(body.images)
      ? body.images.filter(
          (img) =>
            img &&
            typeof img === "object" &&
            (typeof img.dataUrl === "string" || typeof img.blobUrl === "string")
        )
      : [];

    if (!content && images.length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await runStormAiTurn({
      user,
      conversationId: id,
      content,
      images,
      pageContext: body.pageContext ?? null,
    });

    if ("status" in result && result.status) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}
