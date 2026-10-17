import sharp from "sharp";
import { lightingPrompt } from "@/lib/holiday-lighting/preview-prompt";
import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import { saveHolidayPreviewBlob } from "@/lib/holiday-lighting/create-estimate";
import {
  applyHolidayCatalogPolicy,
  holidayDesignOptionsFromQuote,
  parseHolidayCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "@/lib/holiday-lighting/types";
import { persistNativeHolidayPreview, HolidayPreviewConflict } from "@/lib/holiday-lighting/native-preview";
import { requireOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Image edits regularly take longer than a minute. Keep this below the explicit
// OpenAI timeout so there is still time to upload the result and return JSON.
export const maxDuration = 300;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const OPENAI_IMAGE_TIMEOUT_MS = 240_000;


type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true, irrigationFeaturesEnabled: true, holidayLightingFeaturesEnabled: true, holidayLightingCatalog: true },
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
    const clean = form.get("clean") ?? form.get("image");
    if (!(clean instanceof File)) return badRequestResponse("Choose a house photo before generating a preview");
    if (clean.size > MAX_FILE_BYTES) return badRequestResponse("The property photo must be under 4MB");

    const catalog = parseHolidayCatalog(company?.holidayLightingCatalog);
    const rootMeasurements = parseHolidayMeasurements(quote.measurements);
    const rootSelections = applyHolidayCatalogPolicy(parseHolidaySelections(quote.selections), catalog);
    const options = holidayDesignOptionsFromQuote({
      measurements: rootMeasurements,
      selections: rootSelections,
      catalog,
    });
    const requestedOptionId = String(form.get("optionId") ?? "");
    const option = options.find((item) => item.id === requestedOptionId)
      ?? options.find((item) => item.id === rootSelections.activeDesignOptionId)
      ?? options[0];
    if (!option) return badRequestResponse("This quote does not have an option to preview");

    const propertyPhoto = await sharp(Buffer.from(await clean.arrayBuffer()), {limitInputPixels:20_000_000})
      .rotate().resize({width:1536,height:1536,fit:"inside",withoutEnlargement:true}).toColourspace("srgb").jpeg({quality:92}).toBuffer();
    const dimensions = await sharp(propertyPhoto).metadata();
    const outbound = new FormData();
    outbound.append("model", "gpt-image-1.5");
    outbound.append("prompt", lightingPrompt(option, catalog));
    outbound.append("size", (dimensions.width ?? 0) > (dimensions.height ?? 0) ? "1536x1024" : (dimensions.height ?? 0) > (dimensions.width ?? 0) ? "1024x1536" : "1024x1024");
    outbound.append("input_fidelity", "high");
    outbound.append("quality", "high");
    outbound.append("output_format", "png");
    outbound.append("image[]", new Blob([new Uint8Array(propertyPhoto)], {type:"image/jpeg"}), "property.jpg");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: outbound,
      signal: AbortSignal.timeout(OPENAI_IMAGE_TIMEOUT_MS),
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
      optionId: option.id,
      pngBase64: b64,
    });

    // Native clients persist the returned option preview here, atomically. A long
    // generation must not replace a design/photo changed on another device.
    if (form.get("persistOptionPreview") === "true") {
      await persistNativeHolidayPreview({ companyId: user.companyId, quoteId, sourcePhotoUrl: quote.sourcePhotoUrl, option, catalog, previewImageUrl });
      return NextResponse.json({ optionId: option.id, previewImageUrl });
    }

    const isActiveOption = option.id === rootSelections.activeDesignOptionId;
    // Do not update selections here. Several option previews are intentionally
    // generated by concurrent requests; letting every request rewrite the full
    // options array causes last-write-wins data loss. The browser consolidates
    // all successful results and persists the complete array once the batch ends.
    if (isActiveOption || options.length === 1) {
      await prisma.holidayLightingQuote.update({
        where: { id: quoteId },
        data: { previewImageUrl },
      });
    }

    return NextResponse.json({
      optionId: option.id,
      previewImageUrl,
      quotePreviewImageUrl: isActiveOption || options.length === 1
        ? previewImageUrl
        : quote.previewImageUrl,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("disabled")) {
      return forbiddenResponse(error.message);
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return NextResponse.json(
        { error: "The AI preview took too long to finish. Please try generating it again." },
        { status: 504 }
      );
    }
    console.error("Holiday lighting visualize failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
