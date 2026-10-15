import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse, badRequestResponse, forbiddenResponse } from "@/lib/api-auth";
import { assertHolidayLightingEnabled } from "@/lib/holiday-lighting/catalog";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { getGoogleMapsApiKey } from "@/lib/customers/maps";
import { parseHolidaySelections } from "@/lib/holiday-lighting/types";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };
async function owned(request: NextRequest, params: Params["params"]) {
  const user = await requireSessionUser(request);
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true, irrigationFeaturesEnabled: true, holidayLightingFeaturesEnabled: true } });
  assertHolidayLightingEnabled(company ?? {});
  const { id } = await params;
  const quote = await prisma.holidayLightingQuote.findFirst({ where: { id, companyId: user.companyId } });
  return { user, quote };
}
function failure(error: unknown) {
  if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
  if (error instanceof Error && error.message.includes("disabled")) return forbiddenResponse(error.message);
  if (error && typeof error === "object" && "code" in error && error.code === "P2025") return NextResponse.json({ error: "This quote changed in the CRM. Reload before replacing its photo." }, { status: 409 });
  console.error("Holiday property photo failed", error);
  return NextResponse.json({ error: "Could not load or save the property photo. Please try again." }, { status: 500 });
}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { user, quote } = await owned(request, params);
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return badRequestResponse("Choose a JPEG, PNG or WebP photo");
    if (file.size > 4 * 1024 * 1024) return badRequestResponse("Photo must be under 4MB");
    const version = String(form.get("expectedUpdatedAt") ?? "");
    if (version && new Date(version).getTime() !== quote.updatedAt.getTime()) return NextResponse.json({ error: "This quote changed in the CRM. Reload before replacing its photo." }, { status: 409 });
    const blob = await uploadPrivateBlob(`estimates/${user.companyId}/holiday-quotes/${quote.id}/source-${crypto.randomUUID()}`, file, { contentType: file.type });
    const selections = parseHolidaySelections(quote.selections);
    selections.designOptions = selections.designOptions?.map(option => ({ ...option, previewImageUrl: undefined, photoMarkup: [] }));
    const updated = await prisma.holidayLightingQuote.update({ where: { id: quote.id, companyId: user.companyId, updatedAt: quote.updatedAt }, data: { sourcePhotoUrl: blob.url, previewImageUrl: null, selections }, include: { customer: { select: { id: true, name: true } }, estimate: { select: { id: true, estimateNumber: true, status: true } } } });
    return NextResponse.json({ quote: updated });
  } catch (error) { return failure(error); }
}
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { quote } = await owned(request, params);
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    const key = getGoogleMapsApiKey();
    if (!key) return NextResponse.json({ error: "Street View is not configured. Take or select a photo instead." }, { status: 503 });
    const location = quote.lat != null && quote.lng != null ? `${quote.lat},${quote.lng}` : [quote.address, quote.city, quote.state, quote.zip].filter(Boolean).join(", ");
    if (!location) return badRequestResponse("Set the property address first");
    const heading = Number(request.nextUrl.searchParams.get("heading") ?? 0);
    const pitch = Number(request.nextUrl.searchParams.get("pitch") ?? 0);
    if (!Number.isFinite(heading) || !Number.isFinite(pitch)) return badRequestResponse("Invalid Street View direction");
    const query = new URLSearchParams({ location, key, size: "640x480", scale: "2", heading: String(Math.max(0, Math.min(360, heading))), pitch: String(Math.max(-90, Math.min(90, pitch))), fov: "90", return_error_code: "true" });
    const image = await fetch(`https://maps.googleapis.com/maps/api/streetview?${query}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!image.ok) return NextResponse.json({ error: "No Street View photo found. Take or select a property photo instead." }, { status: 404 });
    return new NextResponse(await image.arrayBuffer(), { headers: { "Content-Type": image.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
