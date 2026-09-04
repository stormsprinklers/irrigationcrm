import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import { saveHolidayPreviewBlob } from "@/lib/holiday-lighting/create-estimate";
import { parseHolidayCatalog } from "@/lib/holiday-lighting/types";
import { requireOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

function lightingPrompt(styleLabel: string) {
  return `You are given TWO images of the same residential property:

IMAGE 1 — PROPERTY (clean): a photo of the house (uploaded or Google Street View). Use this as the geometric base — same architecture, camera angle, windows, driveway, landscaping, and layout.

IMAGE 2 — MARKED: the same photo with the user’s brushstroke highlights. Those painted strokes are the ONLY places that should receive holiday lighting.

Instructions — holiday lights:
- Add professional ${styleLabel} C9-style LED Christmas lights strictly inside the brush-marked regions from IMAGE 2.
- Match the requested color: ${styleLabel}.
- Do NOT invent extra holiday lighting anywhere that is not marked.
- Replace the brushstroke paint with realistic installed lights (evenly spaced, neatly clipped, soft evening glow).

Instructions — atmosphere:
- Night / dusk scene with a little fresh snow on the roof, lawn, and shrubs.
- Add a tasteful holiday wreath on the front door if a door is visible.
- Keep ordinary porch, garage, and interior window lights on so the home feels lived-in.

Instructions — image quality:
- Beautify IMAGE 1 into a clean professional real-estate night photograph.
- Preserve the real house, viewpoint, and proportions.
- Do not add people, extra cars, text, logos, or watermarks.

Output one photorealistic dusk/night preview of this exact property.`;
}

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true, holidayLightingCatalog: true },
    });
    assertHolidayLightingEnabled(company ?? {});

    const { id: quoteId } = await params;
    const quote = await prisma.holidayLightingQuote.findFirst({
      where: { id: quoteId, companyId: user.companyId },
    });
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

    let apiKey: string;
    try {
      apiKey = requireOpenAIApiKey();
    } catch {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
    }

    const form = await request.formData();
    // Prefer new clean + marked pair; fall back to legacy image/mask if needed.
    const clean = form.get("clean") ?? form.get("image");
    const marked = form.get("marked") ?? form.get("overlay");
    if (!(clean instanceof File) || !(marked instanceof File)) {
      return badRequestResponse(
        "Both a clean property image and a brush-marked overlay image are required"
      );
    }
    if (clean.size > MAX_BYTES || marked.size > MAX_BYTES) {
      return badRequestResponse("Image files must be under 8MB each");
    }

    const catalog = parseHolidayCatalog(company?.holidayLightingCatalog);
    const styleKey = String(form.get("lightStyle") ?? "");
    const styleLabel =
      catalog.lightStyles.find((s) => s.key === styleKey)?.label ??
      catalog.lightStyles[0]?.label ??
      "warm white";

    const outbound = new FormData();
    outbound.append("model", "gpt-image-1");
    outbound.append("prompt", lightingPrompt(styleLabel));
    outbound.append("size", "1024x1024");
    outbound.append("input_fidelity", "high");
    // First image = clean property (high-fidelity base). Second = brush-marked guide.
    outbound.append(
      "image[]",
      new Blob([await clean.arrayBuffer()], { type: "image/png" }),
      "property.png"
    );
    outbound.append(
      "image[]",
      new Blob([await marked.arrayBuffer()], { type: "image/png" }),
      "property-marked.png"
    );

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: outbound,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      data?: Array<{ b64_json?: string }>;
    };
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? "OpenAI image edit failed" },
        { status: res.status >= 400 ? res.status : 502 }
      );
    }

    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No preview image returned" }, { status: 502 });
    }

    const previewImageUrl = await saveHolidayPreviewBlob({
      companyId: user.companyId,
      quoteId,
      pngBase64: b64,
    });

    const updated = await prisma.holidayLightingQuote.update({
      where: { id: quoteId },
      data: { previewImageUrl },
    });

    return NextResponse.json({
      previewImageUrl: updated.previewImageUrl,
      previewBase64: b64,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Holiday lighting visualize failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
