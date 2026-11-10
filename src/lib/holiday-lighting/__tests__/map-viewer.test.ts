import assert from "node:assert/strict";
import test from "node:test";
import { holidayMapRenderKey } from "@/lib/holiday-lighting/map-viewer";
import type { HolidayStrandMap } from "@/lib/holiday-lighting/strand-map";

function sampleMap(): HolidayStrandMap {
  return {
    version: 1,
    marginPct: 10,
    address: "123 Main St",
    center: { lat: 40.1, lng: -111.7 },
    features: [
      {
        id: "roofline-1",
        label: "Roofline",
        color: "#3B82F6",
        paths: [[{ lat: 40.1, lng: -111.7 }, { lat: 40.1001, lng: -111.7001 }]],
        lengthFt: 40,
        lengthFtWithMargin: 44,
        lightStyleKey: "c9",
        lightStyleLabel: "C9",
        purchaseTotal: 500,
        leaseTotal: 0,
        kind: "segment",
      },
    ],
  };
}

test("keeps the same render key for refreshed estimate data with identical map geometry", () => {
  const first = sampleMap();
  const refreshed = structuredClone(first);

  assert.notEqual(first, refreshed);
  assert.equal(holidayMapRenderKey(first), holidayMapRenderKey(refreshed));
});

test("does not rebuild the map for legend-only price or label updates", () => {
  const first = sampleMap();
  const updated = sampleMap();
  updated.features[0]!.label = "Main roofline";
  updated.features[0]!.purchaseTotal = 650;

  assert.equal(holidayMapRenderKey(first), holidayMapRenderKey(updated));
});

test("changes the render key when overlay geometry changes", () => {
  const first = sampleMap();
  const updated = sampleMap();
  updated.features[0]!.paths[0]![1]!.lat = 40.1002;

  assert.notEqual(holidayMapRenderKey(first), holidayMapRenderKey(updated));
});
