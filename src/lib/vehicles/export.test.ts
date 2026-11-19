import test from "node:test";
import assert from "node:assert/strict";
import { buildVehicleInventoryPdf } from "./export";
import {
  normalizeVehicleNumber,
  vehicleNumberValidationError,
} from "./vehicle-number";
import { isAssetType, normalizeAssetType, parseEstimatedValueCents } from "./inventory";

test("vehicle inventory export builds a PDF with the requested fields", () => {
  const pdf = buildVehicleInventoryPdf([
    {
      year: 2024,
      make: "Ford",
      model: "F-250 Service",
      vin: "1FT8W2BT0REC12345",
      currentMileage: 18450,
      estimatedValueCents: 5250050,
    },
  ]);
  const content = new TextDecoder().decode(pdf);

  assert.ok(content.startsWith("%PDF-1.4"));
  assert.match(content, /\(Make\)[\s\S]*\(Model\)[\s\S]*\(Year\)[\s\S]*\(Mileage\)[\s\S]*\(VIN\)[\s\S]*\(Est\. Value\)/);
  assert.match(content, /\(Ford\)[\s\S]*\(F-250 Service\)[\s\S]*\(2024\)[\s\S]*\(18,450\)[\s\S]*\(1FT8W2BT0REC12345\)[\s\S]*\(\$52,500\.50\)/);
  assert.ok(content.endsWith("%%EOF\n"));
});

test("vehicle inventory export paginates long selections", () => {
  const rows = Array.from({ length: 19 }, (_, index) => ({
    year: 2020 + (index % 5),
    make: "Test",
    model: `Asset ${index + 1}`,
    vin: null,
    currentMileage: index * 100,
    estimatedValueCents: null,
  }));
  const content = new TextDecoder().decode(buildVehicleInventoryPdf(rows));
  assert.match(content, /\/Type \/Pages .* \/Count 2/);
  assert.match(content, /\(Page 1 of 2\)/);
  assert.match(content, /\(Page 2 of 2\)/);
});

test("vehicle and equipment inventory values are normalized", () => {
  assert.equal(normalizeAssetType("EQUIPMENT"), "EQUIPMENT");
  assert.equal(normalizeAssetType("anything-else"), "VEHICLE");
  assert.equal(isAssetType("VEHICLE"), true);
  assert.equal(isAssetType("anything-else"), false);
  assert.deepEqual(parseEstimatedValueCents("12345.67"), { value: 1_234_567 });
  assert.equal(parseEstimatedValueCents(-1).error, "Estimated value must be a valid non-negative amount");
});

test("vehicle numbers are normalized and length-limited", () => {
  assert.equal(normalizeVehicleNumber("  truck   07 "), "TRUCK 07");
  assert.equal(normalizeVehicleNumber("  "), null);
  assert.equal(vehicleNumberValidationError("A".repeat(51)), "Vehicle number must be 50 characters or fewer");
});
