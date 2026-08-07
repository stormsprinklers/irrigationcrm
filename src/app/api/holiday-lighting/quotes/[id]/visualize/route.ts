import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import { saveHolidayPreviewBlob } from "@/lib/holiday-lighting/create-estimate";
import { requireOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

const PROMPT = `You are given TWO images of the same residential property:

IMAGE 1 — PROPERTY (clean): usually a Google Street View / Maps capture of the house. Use this as the geometric base for the final image — same architecture, camera angle, windows, driveway, landscaping, and layout.

IMAGE 2 — MARKED: the same photo with the user’s brushstroke highlights painted on top (typically warm translucent gold/amber strokes). Those painted brushstrokes are the ONLY places that should receive *holiday / Christmas* lighting.

Instructions — holiday lights:
- Add professional warm-white commercial-grade C9-style LED Christmas lights strictly inside the brush-marked regions from IMAGE 2 (rooflines, gables, eaves, trees, bushes, etc. where marked).
- Do NOT invent extra holiday lighting, Christmas decorations, lit garlands, or C9 strands anywhere that is not marked in IMAGE 2.
- Replace the brushstroke paint itself with realistic installed lights (evenly spaced, neatly clipped, soft evening glow). The paint marks are placement guides only — they must not remain visible in the final image.

Instructions — normal property lighting (allowed / encouraged):
- A realistic nighttime home may have ordinary lights on: porch / entry lights, garage coach lights, path or landscape accent lights, and warm interior lights visible through windows.
- Keep or tastefully add those everyday lights where they would naturally belong on this house. They are not holiday lighting.
- Do not turn the whole house into a dark silhouette; the scene should feel lived-in and inviting at dusk/night.

Instructions — image quality:
- Beautify IMAGE 1 from a grainy / compressed Maps photo into a clean professional real-estate night photograph: reduce grain and compression artifacts, refine sharpness and color, and improve night exposure and contrast.
- Preserve the real house, viewpoint, and proportions — do not redesign the architecture, invent buildings, or change the property identity.
- Do not add people, cars, text, logos, or watermarks.

Output one photorealistic dusk/night preview of this exact property: holiday lights only where marked, everyday house lights welcome, and a polished professional photo look.`;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { holidayLightingFeaturesEnabled: true },
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

    const outbound = new FormData();
    outbound.append("model", "gpt-image-1");
    outbound.append("prompt", PROMPT);
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
