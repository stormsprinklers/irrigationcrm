import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import {
  HolidayPreviewConflict,
  persistNativeHolidayPreview,
} from "@/lib/holiday-lighting/native-preview";
import {
  applyHolidayCatalogPolicy,
  holidayDesignOptionsFromQuote,
  parseHolidayCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "@/lib/holiday-lighting/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Params = { params: Promise<{ id: string }> };

async function loadContext(request: NextRequest, params: Params["params"]) {
  const user = await requireSessionUser(request);
  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: {
      name: true,
      irrigationFeaturesEnabled: true,
      holidayLightingFeaturesEnabled: true,
      holidayLightingCatalog: true,
    },
  });
  assertHolidayLightingEnabled(company ?? {});
  const { id: quoteId } = await params;
  const quote = await prisma.holidayLightingQuote.findFirst({
    where: { id: quoteId, companyId: user.companyId },
  });
  if (!quote) return { user, company, quoteId, quote: null, catalog: null, options: [] };
  const catalog = parseHolidayCatalog(company?.holidayLightingCatalog);
  const selections = applyHolidayCatalogPolicy(parseHolidaySelections(quote.selections), catalog);
  const options = holidayDesignOptionsFromQuote({
    measurements: parseHolidayMeasurements(quote.measurements),
    selections,
    catalog,
  });
  return { user, company, quoteId, quote, catalog, options };
}

function failure(error: unknown) {
  if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
  if (error instanceof Error && error.message.includes("disabled")) {
    return forbiddenResponse(error.message);
  }
  if (error instanceof HolidayPreviewConflict) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error("Holiday option preview update failed", error);
  return NextResponse.json({ error: "Could not update this option preview" }, { status: 500 });
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const context = await loadContext(request, params);
    if (!context.quote || !context.catalog) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }
    const form = await request.formData();
    const optionId = String(form.get("optionId") ?? "");
    const option = context.options.find((item) => item.id === optionId);
    if (!option) return badRequestResponse("Choose an option from this quote");
    const file = form.get("file");
    if (!(file instanceof File) || !ALLOWED_IMAGE_TYPES.has(file.type)) {
      return badRequestResponse("Choose a JPEG, PNG, or WebP image");
    }
    if (file.size > MAX_FILE_BYTES) return badRequestResponse("Image must be under 4MB");

    const image = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20_000_000,
    })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    const blob = await uploadPrivateBlob(
      `estimates/${context.user.companyId}/holiday-quotes/${context.quoteId}/options/${option.id}-${crypto.randomUUID()}.jpg`,
      image,
      { contentType: "image/jpeg" }
    );

    await persistNativeHolidayPreview({
      companyId: context.user.companyId,
      quoteId: context.quoteId,
      sourcePhotoUrl: context.quote.sourcePhotoUrl,
      option,
      catalog: context.catalog,
      previewImageUrl: blob.url,
    });
    return NextResponse.json({ optionId: option.id, previewImageUrl: blob.url });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const context = await loadContext(request, params);
    if (!context.quote || !context.catalog) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }
    const optionId = request.nextUrl.searchParams.get("optionId") ?? "";
    const option = context.options.find((item) => item.id === optionId);
    if (!option) return badRequestResponse("Choose an option from this quote");

    await persistNativeHolidayPreview({
      companyId: context.user.companyId,
      quoteId: context.quoteId,
      sourcePhotoUrl: context.quote.sourcePhotoUrl,
      option,
      catalog: context.catalog,
      previewImageUrl: null,
      expectedPreviewUrl: option.previewImageUrl,
    });
    return NextResponse.json({ optionId: option.id, previewImageUrl: null });
  } catch (error) {
    return failure(error);
  }
}
