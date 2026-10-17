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
    selections.designOptions = selections.designOptions?.map(option => ({ ...option, previewImageUrl: undefined, previewBackgroundUrl: undefined, previewLightsUrl: undefined, photoMarkup: [] }));
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
    if (request.nextUrl.searchParams.get("interactive") === "true") {
      const jsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || key;
      const position = quote.lat != null && quote.lng != null ? {lat: Number(quote.lat), lng: Number(quote.lng)} : null;
      const config = JSON.stringify({position, address: location}).replace(/</g, "\\u003c");
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body,#p{height:100%;margin:0}</style></head><body><div id="p"></div><script>
      const config=${config};
      function update(p){const pov=p.getPov();window.webkit?.messageHandlers.position.postMessage({pano:p.getPano(),heading:pov.heading,pitch:pov.pitch});}
      async function init(){try{let position=config.position;if(!position){const result=await new google.maps.Geocoder().geocode({address:config.address});position=result.results[0]?.geometry.location;} const p=new google.maps.StreetViewPanorama(document.getElementById('p'),{position,pov:{heading:0,pitch:0},addressControl:false,fullscreenControl:false,enableCloseButton:false});p.addListener('pov_changed',()=>update(p));p.addListener('pano_changed',()=>update(p));p.addListener('status_changed',()=>{if(p.getStatus()!=='OK')document.getElementById('p').textContent='Street View is unavailable for this property.';});}catch(e){document.getElementById('p').textContent='Street View could not load.';}}
      </script><script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(jsKey)}&callback=init"></script></body></html>`;
      return new NextResponse(html, {headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store"}});
    }
    const heading = Number(request.nextUrl.searchParams.get("heading") ?? 0);
    const pitch = Number(request.nextUrl.searchParams.get("pitch") ?? 0);
    if (!Number.isFinite(heading) || !Number.isFinite(pitch)) return badRequestResponse("Invalid Street View direction");
    const query = new URLSearchParams({ location, key, size: "640x480", scale: "2", heading: String(Math.max(0, Math.min(360, heading))), pitch: String(Math.max(-90, Math.min(90, pitch))), fov: "90", return_error_code: "true" });
    const pano = request.nextUrl.searchParams.get("pano");
    if (pano) { query.delete("location"); query.set("pano", pano.slice(0, 300)); }
    const image = await fetch(`https://maps.googleapis.com/maps/api/streetview?${query}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!image.ok) return NextResponse.json({ error: "No Street View photo found. Take or select a property photo instead." }, { status: 404 });
    return new NextResponse(await image.arrayBuffer(), { headers: { "Content-Type": image.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
