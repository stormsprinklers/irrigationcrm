import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { expireEnRouteVisits, EN_ROUTE_TIMEOUT_MS } from "../en-route-timeout";
import { isHolidayLightingCompany, companyAIName } from "@/lib/company/industry";
import { irrigationFeaturesEnabled, holidayLightingFeaturesEnabled, maintenancePlansFeaturesEnabled } from "@/lib/company/features";
import { buildHolidayStrandMap } from "@/lib/holiday-lighting/strand-map";
import { parseHolidayMeasurements, parseHolidaySelections, parseHolidayCatalog } from "@/lib/holiday-lighting/types";

test("holiday companies use lighting features, while mixed-service companies retain irrigation", () => {
  for (const name of ["Chestnut and Cheer", "Chestnut & Cheer", "  CHESTNUT AND CHEER  "]) {
    const company = {name, irrigationFeaturesEnabled: true, holidayLightingFeaturesEnabled: false, maintenancePlansFeaturesEnabled: true};
    assert.equal(isHolidayLightingCompany(company), true);
    assert.equal(irrigationFeaturesEnabled(company), false);
    assert.equal(holidayLightingFeaturesEnabled(company), true);
    assert.equal(maintenancePlansFeaturesEnabled(company), false);
  }
  assert.equal(isHolidayLightingCompany({name: "Storm Sprinklers", holidayLightingFeaturesEnabled: true, irrigationFeaturesEnabled: true}), false);
  assert.equal(isHolidayLightingCompany({name: "Another Lights", holidayLightingFeaturesEnabled: true, irrigationFeaturesEnabled: false}), true);
  assert.equal(companyAIName("Chestnut and Cheer"), "Chestnut AI");
  assert.equal(companyAIName(" Storm Sprinklers "), "Storm AI");
});

test("two-hour expiration is silent, precise, and safe against repeated/concurrent updates", async t => {
  const now = new Date("2026-10-12T20:00:00Z");
  let changed = false;
  const event = {userId: "tech", occurredAt: new Date(now.getTime() - EN_ROUTE_TIMEOUT_MS)};
  const visit = {id: "visit", companyId: "company", updatedAt: now, timeEvents: [event]};
  const originalFind = prisma.visit.findMany;
  const originalTransaction = prisma.$transaction;
  const writes: any[] = [];
  prisma.visit.findMany = (async args => { assert.equal((args as any).where.companyId, "company"); return [visit]; }) as any;
  prisma.$transaction = (async callback => callback({
    visit: {updateMany: async (args: any) => {writes.push(args); if (changed) return {count: 0}; changed = true; return {count: 1};}},
    visitTimeEvent: {create: async (args: any) => {writes.push(args); return args;}},
    techTimeSegment: {updateMany: async (args: any) => {writes.push(args); return {count: 1};}},
  })) as any;
  t.after(() => {prisma.visit.findMany = originalFind; prisma.$transaction = originalTransaction;});
  assert.equal(await expireEnRouteVisits("company", undefined, new Date(now.getTime() - 1)), 0);
  assert.equal(writes.length, 0);
  assert.equal(await expireEnRouteVisits("company", undefined, now), 1);
  assert.equal(writes[0].data.status, "PAUSED");
  assert.equal(writes[0].data.liveTrackingActive, false);
  assert.equal(writes[1].data.type, "PAUSE");
  assert.equal(writes[1].data.occurredAt.getTime(), now.getTime());
  assert.equal(writes[2].data.endedAt.getTime(), now.getTime());
  assert.equal(await expireEnRouteVisits("company", undefined, new Date(now.getTime() + 60000)), 0);
  assert.equal(writes.length, 4, "duplicate request must not create another pause/segment update");
});

test("saved strand maps carry bulb colors separately from map legend colors", () => {
  const measurements = parseHolidayMeasurements({segments: [{id: "s", label: "Roof", path: [{lat: 40, lng: -111}, {lat: 40.0001, lng: -111}], colorPattern: "Red / White", lightStyleKey: "c9"}], placements: [], strands: []});
  const map = buildHolidayStrandMap({measurements, selections: parseHolidaySelections({defaultColorPattern: "Blue"}), catalog: parseHolidayCatalog(null), pricedLines: []});
  assert.equal(map.features[0].bulbColors, "Red / White");
  assert.equal(map.features[0].lightStyleLabel.includes("C9"), true);
  assert.notEqual(map.features[0].color, map.features[0].bulbColors);
});

import { holidayVisitPlan } from "@/lib/holiday-lighting/visit-plan";
test("visit plan uses approved option B and preserves it across later reads", () => {
  const raw = {source: "holiday-lighting-quote", strandMap: {features: [{id: "a"}]}, options: [{letter: "A", strandMap: {features: [{id: "a"}]}}, {letter: "B", colorPattern: "Blue", previewImageUrl: "https://example.com/b.jpg", strandMap: {features: [{id: "b", bulbColors: "Red"}]}}]};
  const plan = holidayVisitPlan(raw, "B")!;
  assert.equal(plan.approvedOptionLetter, "B");
  assert.equal((plan.strandMap as any).features[0].id, "b");
  assert.equal((plan.strandMap as any).features[0].bulbColors, "Red");
  assert.equal(plan.previewImageUrl, "https://example.com/b.jpg");
  assert.equal(holidayVisitPlan({source: "irrigation-design"}), null);
});
