import { preparePreviewLayers, separatePreviewLights } from "@/lib/holiday-lighting/preview-layers";
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
  type HolidayLightingCatalog,
  type HolidayQuoteDesignOption,
} from "@/lib/holiday-lighting/types";
import { persistNativeHolidayPreview, HolidayPreviewConflict } from "@/lib/holiday-lighting/native-preview";
import { requireOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Image edits regularly take longer than a minute. Keep this below the explicit
// OpenAI timeout so there is still time to upload the result and return JSON.
export const maxDuration = 300;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_IMAGE_BYTES = 4 * 1024 * 1024;
const OPENAI_IMAGE_TIMEOUT_MS = 240_000;

function styleRenderingInstruction(styleKey: string, styleLabel: string) {
  if (styleKey === "mini" || /mini/i.test(styleLabel)) {
    return "Render mini LED string lights: many small, closely spaced points of light wrapped neatly through the tree or bush. Never use C7 or C9 bulb shapes on trees or bushes.";
  }
  if (styleKey === "permanent" || /permanent/i.test(styleLabel)) {
    return "Render sleek, low-profile permanent architectural LEDs tucked tightly under the fascia/soffit in a concealed channel. Use small, closely spaced, crisp points of light that trace the architecture cleanly. Do not render removable C7/C9 bulb shapes, visible clips, hanging wire, or bulky sockets.";
  }
  if (styleKey === "c7" || /c7/i.test(styleLabel)) {
    return "Render authentic C7 LEDs: traditional faceted teardrop bulbs that are visibly smaller and a little less bright than C9 bulbs, consistently spaced and neatly clipped.";
  }
  return "Render authentic C9 LEDs: large, bright, faceted teardrop bulbs with a bold classic roofline appearance, consistently spaced and neatly clipped. They must look clearly larger and brighter than C7 bulbs.";
}

function colorRenderingInstruction(colorPattern: string) {
  const color = colorPattern.trim() || "Warm White";
  if (/winter white/i.test(color)) return "Winter White must be a crisp, cool neutral white with no amber/yellow cast.";
  if (/warm white/i.test(color)) return "Warm White must have a soft warm ivory/golden tone, visibly warmer than Winter White.";
  if (/champagne/i.test(color)) return "Champagne must be an elegant pale warm-gold tone, subtler than yellow and distinct from Warm White.";
  return `Reproduce this requested color or repeating pattern accurately and consistently: ${color}.`;
}

function optionVisualPlan(
  option: HolidayQuoteDesignOption,
  catalog: HolidayLightingCatalog
) {
  const selections = applyHolidayCatalogPolicy(option.selections, catalog);
  const measurements = parseHolidayMeasurements(option.measurements);
  const combinations = new Map<string, { styleKey: string; styleLabel: string; color: string }>();
  for (const item of [...measurements.segments, ...measurements.placements]) {
    const styleKey = item.lightStyleKey ?? selections.defaultLightStyleKey;
    const styleLabel = styleKey === "mini"
      ? "Mini LEDs"
      : catalog.lightStyles.find((style) => style.key === styleKey)?.label ?? styleKey;
    const color = item.colorPattern ?? selections.defaultColorPattern ?? "Warm White";
    combinations.set(`${styleKey}\u0000${color}`, { styleKey, styleLabel, color });
  }
  if (!combinations.size) {
    const styleKey = selections.defaultLightStyleKey;
    combinations.set(styleKey, {
      styleKey,
      styleLabel: catalog.lightStyles.find((style) => style.key === styleKey)?.label ?? styleKey,
      color: selections.defaultColorPattern ?? "Warm White",
    });
  }
  const appearanceRules = [...combinations.values()].map((item, index) =>
    `${index + 1}. ${item.styleLabel}, ${item.color}: ${styleRenderingInstruction(item.styleKey, item.styleLabel)} ${colorRenderingInstruction(item.color)}`
  ).join("\n");
  const layout = [
    ...measurements.segments.map((segment) => {
      const styleKey = segment.lightStyleKey ?? selections.defaultLightStyleKey;
      const styleLabel = styleKey === "mini"
        ? "Mini LEDs"
        : catalog.lightStyles.find((style) => style.key === styleKey)?.label ?? styleKey;
      return `Roofline "${segment.label}": ${styleLabel}, ${segment.colorPattern ?? selections.defaultColorPattern ?? "Warm White"}`;
    }),
    ...measurements.placements.map((placement) => {
      const styleKey = placement.lightStyleKey ?? selections.defaultLightStyleKey;
      const styleLabel = "Mini LEDs";
      return `${placement.kind === "tree" ? "Tree" : "Bush"} "${placement.label}": ${placement.strandCount ?? 1} strand(s), ${styleLabel}, ${placement.colorPattern ?? selections.defaultColorPattern ?? "Warm White"}`;
    }),
  ].slice(0, 40).map((line) => `- ${line}`).join("\n");
  return `LIGHT APPEARANCE RULES:\n${appearanceRules}\n\nOPTION LAYOUT:\n${layout || "- Apply the option's default specification to every marked area."}`;
}

function lightingPrompt(option: HolidayQuoteDesignOption, catalog: HolidayLightingCatalog) {
  const visualPlan = optionVisualPlan(option, catalog);
  return `You are given ONE unpainted photograph of the residential property and a separate transparent edit mask. The transparent mask regions are the ONLY locations allowed to receive holiday lights. The mask specifies placement, not the shape, thickness, color, or appearance of the lights. There is no colored reference paint to reproduce.

Instructions — holiday lights:
- Create a distinct preview for the estimate option named "${option.label}" using this exact lighting specification:
${visualPlan}
- Where more than one specification is listed, keep their bulb scale, construction, brightness, and colors visually distinct rather than blending them into one generic light style.
- Add professional LED holiday lights strictly inside the transparent mask regions.
- Do NOT invent extra holiday lighting anywhere that is not marked. Unpainted trees, bushes, windows and roof edges must remain unlit even if they appear in the option layout. The transparent edit mask takes precedence over the textual layout.
- Install discrete three-dimensional bulbs with small sockets, fine dark wiring and clips. For C9, space individual bulbs roughly 12 inches apart along the roof edge. For mini LEDs, use smaller pinpoints on fine wire. The mask is a broad placement boundary, not a luminous strip to fill.

Instructions — atmosphere:
- Preserve the source exposure and surroundings outside the edit mask.
- Do not add wreaths, snow, decorations, or lights outside painted areas.
- Keep ordinary porch, garage, and interior window lights on so the home feels lived-in.

Instructions — image quality:
- Render separate physically plausible bulbs, with visible dark gaps and subtle halos. Never render continuous glowing lines, neon tubes, light ribbons, or paint strokes.
- Preserve the real house, viewpoint, and proportions.
- Do not add people, extra cars, text, logos, or watermarks.

Keep the input house exposure and ambient lighting unchanged. Output a photorealistic installed-light preview, not a drawing or illustration.`;
}

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
    // Prefer new clean + marked pair; fall back to legacy image/mask if needed.
    const clean = form.get("clean") ?? form.get("image");
    const marked = form.get("marked") ?? form.get("overlay");
    if (!(clean instanceof File) || !(marked instanceof File)) {
      return badRequestResponse(
        "Both a clean property image and a brush-marked overlay image are required"
      );
    }
    if (clean.size > MAX_FILE_BYTES || marked.size > MAX_FILE_BYTES) {
      return badRequestResponse("Image files must be under 4MB each");
    }
    if (clean.size + marked.size > MAX_REQUEST_IMAGE_BYTES) {
      return badRequestResponse("Combined preview images must be under 4MB");
    }

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

    const editMask = form.get("editMask");
    if (editMask instanceof File && (editMask.type !== "image/png" || editMask.size > MAX_FILE_BYTES || clean.size + marked.size + editMask.size > MAX_REQUEST_IMAGE_BYTES)) return badRequestResponse("Invalid lighting edit mask");
    const layers = await preparePreviewLayers(Buffer.from(await clean.arrayBuffer()), Buffer.from(await marked.arrayBuffer()), editMask instanceof File ? Buffer.from(await editMask.arrayBuffer()) : undefined);
    const outbound = new FormData();
    outbound.append("model", "gpt-image-1.5");
    outbound.append("prompt", lightingPrompt(option, catalog));
    outbound.append("size", layers.width > layers.height ? "1536x1024" : layers.height > layers.width ? "1024x1536" : "1024x1024");
    outbound.append("input_fidelity", "high");
    outbound.append("quality", "high");
    outbound.append("image[]", new Blob([new Uint8Array(layers.background)], {type:"image/png"}), "property.png");
    outbound.append("mask", new Blob([new Uint8Array(layers.mask)], {type:"image/png"}), "placement-mask.png");

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

    const separated = await separatePreviewLights(layers.background, Buffer.from(b64,"base64"), layers.mask);
    const previewBackgroundUrl = await saveHolidayPreviewBlob({companyId:user.companyId,quoteId,optionId:`${option.id}-house`,pngBase64:layers.background.toString("base64")});
    const previewLightsUrl = await saveHolidayPreviewBlob({companyId:user.companyId,quoteId,optionId:`${option.id}-lights`,pngBase64:separated.lights.toString("base64")});
    const previewImageUrl = await saveHolidayPreviewBlob({
      companyId: user.companyId,
      quoteId,
      optionId: option.id,
      pngBase64: separated.composite.toString("base64"),
    });

    // Native clients persist the returned option preview here, atomically. A long
    // generation must not replace a design/photo changed on another device.
    if (form.get("persistOptionPreview") === "true") {
      await persistNativeHolidayPreview({ companyId: user.companyId, quoteId, sourcePhotoUrl: quote.sourcePhotoUrl, option, catalog, previewImageUrl, previewBackgroundUrl, previewLightsUrl });
      return NextResponse.json({ optionId: option.id, previewImageUrl, previewBackgroundUrl, previewLightsUrl });
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
      previewBackgroundUrl, previewLightsUrl,
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
