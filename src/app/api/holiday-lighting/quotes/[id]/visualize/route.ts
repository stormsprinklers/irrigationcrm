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

const MAX_BYTES = 4 * 1024 * 1024;

const PROMPT = `Photorealistic preview of this exact house with professional Christmas light installation.

Add warm-white commercial-grade C9-style LED Christmas lights ONLY in the masked/transparent regions (typically rooflines, gables, eaves, trees, and bushes). Lights should look evenly spaced, neatly clipped, and glowing softly at dusk/evening.

Keep the house architecture, windows, driveway, landscaping layout, and camera angle unchanged. Do not add people, cars, text, logos, or watermarks. Do not redecorate areas outside the mask. High-end residential holiday lighting look.`;

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
    const image = form.get("image");
    const mask = form.get("mask");
    if (!(image instanceof File) || !(mask instanceof File)) {
      return badRequestResponse("Both image and mask files are required");
    }
    if (image.size > MAX_BYTES || mask.size > MAX_BYTES) {
      return badRequestResponse("Image files must be under 4MB each");
    }

    const outbound = new FormData();
    outbound.append("model", "gpt-image-1");
    outbound.append("prompt", PROMPT);
    outbound.append("size", "1024x1024");
    outbound.append("image", new Blob([await image.arrayBuffer()], { type: "image/png" }), "house.png");
    outbound.append("mask", new Blob([await mask.arrayBuffer()], { type: "image/png" }), "mask.png");

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
