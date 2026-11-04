import assert from "node:assert/strict";
import test from "node:test";
import { buildHolidayScheduleCsv } from "./schedule-export";

test("holiday schedule CSV includes lighting fields and escapes spreadsheet formulas", () => {
  const csv = buildHolidayScheduleCsv([{
    date: "11/04/2026",
    time: "9:00 AM",
    customerName: "=HYPERLINK(\"bad\")",
    technicians: "Alex Smith; Jo Lee",
    address: "123 Main St, Denver, CO",
    strandColor: "Black",
    footageCount: 145.5,
    lightColorPattern: "Red, Green",
  }]);

  assert.ok(csv.startsWith("\uFEFFDate,Time,Customer Name,Technician(s),Address,Strand Color,Footage Count,Light Color / Pattern\r\n"));
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv, /Black,145\.5,"Red, Green"/);
});
