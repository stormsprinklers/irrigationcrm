import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../../prisma";
import { signMobileAccessToken } from "../../mobile-auth/tokens";
import { DEFAULT_HOLIDAY_CATALOG, holidayDesignOptionsFromQuote, parseHolidayMeasurements, parseHolidaySelections, parseHolidayPhotoMarkup } from "../types";
import { persistNativeHolidayPreview, HolidayPreviewConflict } from "../native-preview";
import { POST as erasePreview } from "../../../app/api/holiday-lighting/quotes/[id]/preview-edit/route";
import { PATCH } from "../../../app/api/holiday-lighting/quotes/[id]/route";
import { GET as photo, POST as uploadPhoto } from "../../../app/api/holiday-lighting/quotes/[id]/photo/route";

process.env.AUTH_SECRET = "native-builder-test-only";
process.env.MOBILE_JWT_SECRET = "native-builder-mobile-test-only";
function stub(t: TestContext, model: any, method: string, implementation: (...args: any[]) => any) {
  const original = model[method]; const spy = t.mock.fn(implementation); model[method] = spy;
  t.after(() => { model[method] = original; }); return spy;
}
const user = { id: "staff", companyId: "company-a", role: "ADMIN", status: "ACTIVE", name: "Owner", email: "a@example.com" };
async function request(path: string, method = "GET", body?: object) {
  const token = await signMobileAccessToken({ sub: user.id, companyId: user.companyId, role: user.role });
  return new NextRequest(`https://crm.example.com${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function auth(t: TestContext) {
  stub(t, prisma.user, "findUnique", async () => user);
  stub(t, prisma.company, "findUnique", async () => ({ name: "Chestnut and Cheer", holidayLightingFeaturesEnabled: true, holidayLightingCatalog: DEFAULT_HOLIDAY_CATALOG }));
}
function fixture() {
  const measurements = { segments: [{ id: "run", label: "Peak", kind: "roofline", path: [{ lat: 40, lng: -111 }, { lat: 40.001, lng: -111 }], horizontalLengthFt: 30, lengthFt: 30, hasPeak: true, colorPattern: "Red / Green" }], placements: [], strands: [{ id: "strand", label: "Front", segmentIds: ["run"] }] };
  const selections = parseHolidaySelections({ defaultLightStyleKey: "c9", activeDesignOptionId: "b", designOptions: [
    { id: "a", label: "Buy", measurements, selections: { pricingMode: "buy" }, previewImageUrl: "old-a" },
    { id: "b", label: "Lease", measurements, selections: { pricingMode: "lease" }, previewImageUrl: "old-b", photoMarkup: [{ id: "paint", points: [{ x: 0.25, y: 0.75 }], color: "#ffb020", width: 0.012 }] },
  ] });
  return { id: "quote", companyId: user.companyId, updatedAt: new Date("2026-10-14T10:00:00Z"), measurements, selections, sourcePhotoUrl: "source", previewImageUrl: "old-b" };
}

test("native photo markup and independent options survive the CRM parser", () => {
  const quote = fixture();
  const options = holidayDesignOptionsFromQuote({ measurements: parseHolidayMeasurements(quote.measurements), selections: parseHolidaySelections(quote.selections), catalog: DEFAULT_HOLIDAY_CATALOG });
  assert.equal(options[0].selections.pricingMode, "buy");
  assert.equal(options[1].selections.pricingMode, "lease");
  assert.equal(options[1].photoMarkup?.[0].points[0].x, 0.25);
  assert.deepEqual(options[1].measurements.strands?.[0].segmentIds, ["run"]);
  assert.equal(options[1].measurements.segments[0].hasPeak, true);
  assert.deepEqual(parseHolidayPhotoMarkup([{ points: [{ x: Infinity, y: 1 }, { x: 0.5, y: -1 }] }]), []);
});

test("saving a native preview updates only that option and uses the latest revision", async t => {
  const quote = fixture();
  stub(t, prisma.holidayLightingQuote, "findFirst", async () => quote);
  const update = stub(t, prisma.holidayLightingQuote, "update", async () => quote);
  const option = holidayDesignOptionsFromQuote({ measurements: quote.measurements as any, selections: quote.selections, catalog: DEFAULT_HOLIDAY_CATALOG })[0];
  await persistNativeHolidayPreview({ companyId: user.companyId, quoteId: quote.id, sourcePhotoUrl: "source", option, catalog: DEFAULT_HOLIDAY_CATALOG, previewImageUrl: "new-a" });
  const call = update.mock.calls[0].arguments[0];
  assert.deepEqual(call.where, { id: "quote", companyId: "company-a", updatedAt: quote.updatedAt });
  assert.equal(call.data.selections.designOptions[0].previewImageUrl, "new-a");
  assert.equal(call.data.selections.designOptions[1].previewImageUrl, "old-b");
  assert.equal(call.data.previewImageUrl, undefined, "inactive preview must not replace active option B");
});

test("a preview generated for an old source photo cannot overwrite a changed quote", async t => {
  const quote = fixture();
  stub(t, prisma.holidayLightingQuote, "findFirst", async () => ({ ...quote, sourcePhotoUrl: "replacement-photo" }));
  const update = stub(t, prisma.holidayLightingQuote, "update", async () => quote);
  const option = holidayDesignOptionsFromQuote({ measurements: quote.measurements as any, selections: quote.selections, catalog: DEFAULT_HOLIDAY_CATALOG })[1];
  await assert.rejects(persistNativeHolidayPreview({ companyId: user.companyId, quoteId: quote.id, sourcePhotoUrl: "source", option, catalog: DEFAULT_HOLIDAY_CATALOG, previewImageUrl: "stale" }), HolidayPreviewConflict);
  assert.equal(update.mock.callCount(), 0);
});

test("native photo endpoints reject anonymous and cross-company quote access", async t => {
  assert.equal((await photo(new NextRequest("https://crm.example.com/api/holiday-lighting/quotes/q/photo", { headers: { authorization: "Bearer invalid" } }), { params: Promise.resolve({ id: "q" }) })).status, 401);
  auth(t);
  const lookup = stub(t, prisma.holidayLightingQuote, "findFirst", async () => null);
  assert.equal((await photo(await request("/api/holiday-lighting/quotes/foreign/photo"), { params: Promise.resolve({ id: "foreign" }) })).status, 404);
  assert.equal((await uploadPhoto(await request("/api/holiday-lighting/quotes/foreign/photo", "POST"), { params: Promise.resolve({ id: "foreign" }) })).status, 404);
  assert.deepEqual(lookup.mock.calls[0].arguments[0].where, { id: "foreign", companyId: "company-a" });
});

test("quote edits cannot attach a property from another company", async t => {
  auth(t);
  stub(t, prisma.holidayLightingQuote, "findFirst", async () => ({ ...fixture(), customerId: "customer", propertyId: null, visitId: null }));
  stub(t, prisma.customer, "findFirst", async () => ({ id: "customer" }));
  stub(t, prisma.customerProperty, "findFirst", async () => null);
  const update = stub(t, prisma.holidayLightingQuote, "update", async () => { throw new Error("must not update"); });
  const response = await PATCH(await request("/api/holiday-lighting/quotes/quote", "PATCH", { propertyId: "foreign-property" }), { params: Promise.resolve({ id: "quote" }) });
  assert.equal(response.status, 400);
  assert.equal(update.mock.callCount(), 0);
});

test("native quote save conflicts return 409 instead of overwriting a newer revision", async t => {
  auth(t);
  stub(t, prisma.holidayLightingQuote, "findFirst", async () => ({ ...fixture(), customerId: null, propertyId: null, visitId: null }));
  const update = stub(t, prisma.holidayLightingQuote, "update", async () => { throw { code: "P2025" }; });
  const response = await PATCH(await request("/api/holiday-lighting/quotes/quote", "PATCH", { expectedUpdatedAt: "2026-10-13T10:00:00Z", address: "1 Main St" }), { params: Promise.resolve({ id: "quote" }) });
  assert.equal(response.status, 409);
  assert.equal(update.mock.calls[0].arguments[0].where.updatedAt.toISOString(), "2026-10-13T10:00:00.000Z");
});

test("payload encoded by the Swift models keeps CRM prices, options, peaks and colors", async () => {
  const { readFileSync } = await import("node:fs");
  const { computeHolidayQuotePricing } = await import("../pricing");
  const payload = JSON.parse(readFileSync(new URL("./fixtures/native-quote.json", import.meta.url), "utf8"));
  const selections = parseHolidaySelections(payload.selections);
  const options = holidayDesignOptionsFromQuote({ measurements: parseHolidayMeasurements(payload.measurements), selections, catalog: DEFAULT_HOLIDAY_CATALOG });
  const prices = new Map([
    ["HL-C9-PARTS-FT", { id: "parts", name: "C9 parts", unitPrice: 2.25, unitCost: null }],
    ["HL-TEMP-INSTALL-FT", { id: "labor", name: "Labor", unitPrice: 2.99, unitCost: null }],
    ["HL-C9-LEASE-FT", { id: "lease", name: "Lease", unitPrice: 4.59, unitCost: null }],
  ]);
  const buy = computeHolidayQuotePricing({ measurements: options[0].measurements, selections: parseHolidaySelections(options[0].selections), catalog: DEFAULT_HOLIDAY_CATALOG, prices });
  const lease = computeHolidayQuotePricing({ measurements: options[1].measurements, selections: parseHolidaySelections(options[1].selections), catalog: DEFAULT_HOLIDAY_CATALOG, prices });
  assert.equal(buy.billedLengthFt, 45);
  assert.equal(buy.year1Total, 235.8);
  assert.equal(lease.leaseTotal, 206.55);
  assert.equal(options[0].measurements.segments[0].colorPattern, "Red / Green");
  assert.equal(options[1].measurements.segments[0].colorPattern, "Warm White");
  assert.equal(options[1].photoMarkup?.[0].points[0].x, 0.25);
  assert.equal(selections.activeDesignOptionId, options[1].id);
});

test("layered preview URLs stay in option JSON, and stale eraser saves are rejected", async t => {
  const quote = fixture();
  stub(t, prisma.holidayLightingQuote, "findFirst", async () => quote);
  const update = stub(t, prisma.holidayLightingQuote, "update", async () => quote);
  const option = holidayDesignOptionsFromQuote({measurements: parseHolidayMeasurements(quote.measurements),selections:quote.selections,catalog:DEFAULT_HOLIDAY_CATALOG})[1];
  await persistNativeHolidayPreview({companyId:user.companyId,quoteId:quote.id,sourcePhotoUrl:"source",option,catalog:DEFAULT_HOLIDAY_CATALOG,previewImageUrl:"new-b",previewBackgroundUrl:"house-b",previewLightsUrl:"lights-b",expectedPreviewUrl:"old-b"});
  const data = update.mock.calls[0].arguments[0].data;
  assert.deepEqual(Object.keys(data).sort(),["previewImageUrl","selections"]);
  const parsed = holidayDesignOptionsFromQuote({measurements:parseHolidayMeasurements(quote.measurements),selections:parseHolidaySelections(data.selections),catalog:DEFAULT_HOLIDAY_CATALOG});
  assert.equal(parsed[1].previewBackgroundUrl,"house-b");
  assert.equal(parsed[1].previewLightsUrl,"lights-b");
  await assert.rejects(persistNativeHolidayPreview({companyId:user.companyId,quoteId:quote.id,sourcePhotoUrl:"source",option,catalog:DEFAULT_HOLIDAY_CATALOG,previewImageUrl:"erased",expectedPreviewUrl:"obsolete"}),HolidayPreviewConflict);
  assert.equal(update.mock.callCount(),1);
});

test("preview erasing rejects anonymous and cross-company access",async t=>{
  assert.equal((await erasePreview(new NextRequest("https://crm.example.com/api/holiday-lighting/quotes/q/preview-edit",{method:"POST",headers:{authorization:"Bearer invalid"}}),{params:Promise.resolve({id:"q"})})).status,401);
  auth(t);
  const lookup = stub(t,prisma.holidayLightingQuote,"findFirst",async()=>null);
  assert.equal((await erasePreview(await request("/api/holiday-lighting/quotes/foreign/preview-edit","POST"),{params:Promise.resolve({id:"foreign"})})).status,404);
  assert.deepEqual(lookup.mock.calls[0].arguments[0].where,{id:"foreign",companyId:"company-a"});
});
