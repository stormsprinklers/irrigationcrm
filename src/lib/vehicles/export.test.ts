import test from "node:test";
import assert from "node:assert/strict";
import { buildVehicleExportCsv } from "./export";
import {
  normalizeVehicleNumber,
  vehicleNumberValidationError,
} from "./vehicle-number";

test("vehicle export includes the requested fleet fields and escapes CSV values", () => {
  const csv = buildVehicleExportCsv([
    {
      vehicleNumber: "TRUCK 07",
      licensePlate: "ABC123",
      year: 2024,
      make: "Ford",
      model: 'F-250, "Service"',
      vin: "1FT8W2BT0REC12345",
      currentMileage: 18450,
    },
  ]);

  assert.ok(csv.startsWith("\uFEFFVehicle Number,License Plate,Year,Make,Model,VIN,Mileage\r\n"));
  assert.match(csv, /TRUCK 07,ABC123,2024,Ford,"F-250, ""Service""",1FT8W2BT0REC12345,18450/);
});

test("vehicle export neutralizes spreadsheet formulas", () => {
  const csv = buildVehicleExportCsv([
    {
      vehicleNumber: "=1+1",
      licensePlate: null,
      year: 2020,
      make: "+cmd",
      model: "Truck",
      vin: null,
      currentMileage: 0,
    },
  ]);

  assert.match(csv, /'=1\+1,,2020,'\+cmd,Truck,,0/);
});

test("vehicle numbers are normalized and length-limited", () => {
  assert.equal(normalizeVehicleNumber("  truck   07 "), "TRUCK 07");
  assert.equal(normalizeVehicleNumber("  "), null);
  assert.equal(vehicleNumberValidationError("A".repeat(51)), "Vehicle number must be 50 characters or fewer");
});
