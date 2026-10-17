import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireSessionUser, unauthorizedResponse, badRequestResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import { parseHolidayCatalog, parseHolidaySelections, parseHolidayMeasurements, holidayDesignOptionsFromQuote } from "@/lib/holiday-lighting/types";
import { fetchBlobBytes } from "@/lib/blob/download";
import { isBlobStorageUrl, blobPathnameFromUrl, canAccessBlobPath } from "@/lib/blob/urls";
import { saveHolidayPreviewBlob } from "@/lib/holiday-lighting/create-estimate";
import { persistNativeHolidayPreview } from "@/lib/holiday-lighting/native-preview";

export const maxDuration = 60;
export async function POST(request: NextRequest, {params}: {params: Promise<{id:string}>}) {
  try {
    const user = await requireSessionUser(request);
    const {id} = await params;
    const quote = await prisma.holidayLightingQuote.findFirst({where:{id,companyId:user.companyId}});
    if (!quote) return NextResponse.json({error:"Quote not found"},{status:404});
    const company = await prisma.company.findUnique({where:{id:user.companyId}});
    assertHolidayLightingEnabled(company ?? {});
    const catalog = parseHolidayCatalog(company?.holidayLightingCatalog);
    const selections = parseHolidaySelections(quote.selections);
    const options = holidayDesignOptionsFromQuote({measurements:parseHolidayMeasurements(quote.measurements),selections,catalog});
    const form = await request.formData();
    const option = options.find(item=>item.id===form.get("optionId"));
    if (!option?.previewBackgroundUrl || !option.previewLightsUrl) return badRequestResponse("Regenerate this preview to enable light erasing");
    if (option.previewImageUrl !== form.get("expectedPreviewUrl")) return NextResponse.json({error:"The preview changed. Reopen it before editing."},{status:409});
    const pathname = blobPathnameFromUrl(option.previewBackgroundUrl);
    if (!isBlobStorageUrl(option.previewBackgroundUrl) || !pathname || !canAccessBlobPath(user.companyId,pathname)) return badRequestResponse("Invalid preview background");
    const file = form.get("lights");
    if (!(file instanceof File) || file.type !== "image/png" || file.size > 4*1024*1024) return badRequestResponse("Use a PNG lights layer under 4MB");
    const background = (await fetchBlobBytes(option.previewBackgroundUrl)).buffer;
    const lights = Buffer.from(await file.arrayBuffer());
    const baseInfo = await sharp(background,{limitInputPixels:20_000_000}).metadata();
    const lightInfo = await sharp(lights,{limitInputPixels:20_000_000}).metadata();
    if (baseInfo.width !== lightInfo.width || baseInfo.height !== lightInfo.height || !lightInfo.hasAlpha) return badRequestResponse("The lights layer must match the house layer");
    const composite = await sharp(background).composite([{input:lights}]).png().toBuffer();
    const previewLightsUrl = await saveHolidayPreviewBlob({companyId:user.companyId,quoteId:id,optionId:`${option.id}-lights`,pngBase64:lights.toString("base64")});
    const previewImageUrl = await saveHolidayPreviewBlob({companyId:user.companyId,quoteId:id,optionId:option.id,pngBase64:composite.toString("base64")});
    await persistNativeHolidayPreview({companyId:user.companyId,quoteId:id,sourcePhotoUrl:quote.sourcePhotoUrl,option,catalog,previewImageUrl,previewBackgroundUrl:option.previewBackgroundUrl,previewLightsUrl,expectedPreviewUrl:option.previewImageUrl});
    return NextResponse.json({previewImageUrl,previewLightsUrl,previewBackgroundUrl:option.previewBackgroundUrl});
  } catch(error) {
    if(error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Preview correction failed",error);
    return badRequestResponse(error instanceof Error ? error.message : "Could not save preview correction");
  }
}
