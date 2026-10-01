import test from "node:test";
import assert from "node:assert/strict";
import {
  computeHolidayQuotePricing,
  HOLIDAY_LABOR_ONLY_DISCLAIMER,
  holidayBuyBreakdownLines,
  holidayDetailedBuyLines,
  holidayDetailedLaborOnlyLines,
} from "../pricing";
import {
  DEFAULT_HOLIDAY_CATALOG,
  applyHolidayCatalogPolicy,
  holidayCatalogSkus,
  parseHolidaySelections,
} from "../types";

const style = DEFAULT_HOLIDAY_CATALOG.lightStyles[0]!;
const prices = new Map([
  [style.temporaryYear1Sku, { id: "buy", name: "Buy", unitPrice: 10, unitCost: null }],
  [style.temporaryReinstallSku, { id: "reinstall", name: "Reinstall", unitPrice: 5, unitCost: null }],
  [style.leaseSku, { id: "lease", name: "Lease", unitPrice: 8, unitCost: null }],
  [style.permanentSku, { id: "permanent", name: "Permanent", unitPrice: 20, unitCost: null }],
]);
const measurements = {
  segments: [{ id: "roof", label: "Roof", kind: "roofline" as const, path: [], lengthFt: 10 }],
  placements: [],
};

test("quote-specific prices and discounts survive parsing and affect each option", () => {
  const selections = parseHolidaySelections({
    defaultLightStyleKey: style.key,
    installKind: "temporary",
    reinstallPrice: 45,
    optionAdjustments: {
      buy: { price: 120, discountType: "fixed", discountAmount: 30 },
      lease: { discountLabel: "Early booking", discountType: "percent", discountAmount: 25 },
      permanent: { discountType: "percent", discountAmount: 10 },
    },
  });
  const result = computeHolidayQuotePricing({ catalog: DEFAULT_HOLIDAY_CATALOG, measurements, selections, prices });
  assert.deepEqual(result.optionDetails.buy, { calculated: 150, subtotal: 120, discountTotal: 30, total: 90 });
  assert.deepEqual(result.optionDetails.lease, { calculated: 80, subtotal: 80, discountTotal: 20, total: 60 });
  assert.equal(selections.optionAdjustments?.lease?.discountLabel, "Early booking");
  assert.equal(result.permanentTotal, 180);
  assert.equal(result.reinstallTotal, 45);
});

test("discounts cannot reduce an option below zero", () => {
  const selections = parseHolidaySelections({ optionAdjustments: { buy: { price: 20, discountType: "fixed", discountAmount: 100 } } });
  const result = computeHolidayQuotePricing({ catalog: DEFAULT_HOLIDAY_CATALOG, measurements, selections, prices });
  assert.equal(result.optionDetails.buy.discountTotal, 20);
  assert.equal(result.year1Total, 0);
});

test("buy breakdown treats the Year 2 cost as labor and the remainder as parts", () => {
  const lines = holidayBuyBreakdownLines({
    year1Subtotal: 1_250,
    year2LaborTotal: 475,
  });
  assert.deepEqual(
    lines.map(({ name, total }) => ({ name, total })),
    [
      { name: "Parts", total: 775 },
      { name: "Labor (Year 2 cost)", total: 475 },
    ]
  );
  assert.equal(lines.reduce((sum, line) => sum + line.total, 0), 1_250);
  assert.doesNotMatch(lines.map((line) => `${line.name} ${line.description}`).join(" "), /per foot|\/ft/i);
});

test("permanent holiday lighting defaults to $25 per foot", () => {
  const permanentSkus = new Set(
    DEFAULT_HOLIDAY_CATALOG.lightStyles.map((lightStyle) => lightStyle.permanentSku)
  );
  const rows = holidayCatalogSkus(DEFAULT_HOLIDAY_CATALOG).filter((row) =>
    permanentSkus.has(row.sku)
  );
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.unit === "ft" && row.defaultUnitPrice === 25));
});

test("C9 and C7 default prices are independent of color", () => {
  const rows = new Map(holidayCatalogSkus(DEFAULT_HOLIDAY_CATALOG).map((row) => [row.sku, row]));
  const c9 = DEFAULT_HOLIDAY_CATALOG.lightStyles.find((item) => item.key === "c9")!;
  const c7 = DEFAULT_HOLIDAY_CATALOG.lightStyles.find((item) => item.key === "c7")!;
  assert.equal(rows.get(c9.partsSku!)?.defaultUnitPrice, 2.25);
  assert.equal(rows.get(c7.partsSku!)?.defaultUnitPrice, 2.15);
  assert.equal(rows.get(c9.installSku!)?.defaultUnitPrice, 2.99);
  assert.equal(rows.get(c9.leaseSku)?.defaultUnitPrice, 4.59);
  assert.equal(rows.get(c7.leaseSku)?.defaultUnitPrice, 4.29);
});

test("detailed buy lines show parts and year-two labor without per-foot pricing", () => {
  const lines = holidayDetailedBuyLines({
    targetSubtotal: 52.4,
    lines: [{
      key: "roof",
      name: "Roofline 1",
      description: "10 ft",
      staffDetail: "10 ft",
      purchaseTotal: 52.4,
      leaseTotal: 45.9,
      partsTotal: 22.5,
      laborTotal: 29.9,
      reinstallTotal: 29.9,
      colorPattern: "Warm White",
      lightStyleLabel: "C9",
      kind: "roofline",
    }],
  });
  assert.deepEqual(lines.map((line) => line.total), [22.5, 29.9]);
  assert.match(lines[1]!.name, /Year 2 cost/);
  assert.doesNotMatch(JSON.stringify(lines), /per foot|\/ft/i);
});

test("branded estimate combines every roofline segment into one parts and labor breakdown", () => {
  const baseLine = {
    key: "roof-1",
    name: "Front eave",
    description: "10 ft",
    staffDetail: "10 ft",
    purchaseTotal: 52.4,
    leaseTotal: 45.9,
    partsTotal: 22.5,
    laborTotal: 29.9,
    reinstallTotal: 29.9,
    colorPattern: "Warm White",
    lightStyleLabel: "C9",
    kind: "roofline" as const,
  };
  const lines = holidayDetailedBuyLines({
    targetSubtotal: 104.8,
    lines: [baseLine, { ...baseLine, key: "roof-2", name: "Garage eave" }],
  });
  assert.deepEqual(lines.map(({ name, total }) => ({ name, total })), [
    { name: "Roofline — parts", total: 45 },
    { name: "Roofline — labor (Year 2 cost)", total: 59.8 },
  ]);
  assert.doesNotMatch(JSON.stringify(lines), /Front eave|Garage eave/);
});

test("labor-only branded estimate combines every roofline segment into one line", () => {
  const baseLine = {
    key: "roof-1",
    name: "Front eave",
    description: "10 ft",
    staffDetail: "10 ft",
    purchaseTotal: 29.9,
    leaseTotal: 45.9,
    partsTotal: 0,
    laborTotal: 29.9,
    reinstallTotal: 29.9,
    colorPattern: "Warm White",
    lightStyleLabel: "C9",
    kind: "roofline" as const,
  };
  const lines = holidayDetailedLaborOnlyLines({
    targetSubtotal: 59.8,
    lines: [baseLine, { ...baseLine, key: "roof-2", name: "Garage eave" }],
  });
  assert.deepEqual(lines.map(({ name, total }) => ({ name, total })), [
    { name: "Roofline — labor only", total: 59.8 },
  ]);
  assert.doesNotMatch(JSON.stringify(lines), /Front eave|Garage eave/);
});

test("customer-facing breakdown hides internal price and minimum adjustments", () => {
  const pricedLine = {
    key: "roof-1",
    name: "Front eave",
    description: "10 ft",
    staffDetail: "10 ft",
    purchaseTotal: 52.4,
    leaseTotal: 45.9,
    partsTotal: 22.5,
    laborTotal: 29.9,
    reinstallTotal: 29.9,
    colorPattern: "Warm White",
    lightStyleLabel: "C9",
    kind: "roofline" as const,
  };
  const laborLines = holidayDetailedLaborOnlyLines({
    targetSubtotal: 25,
    lines: [pricedLine],
  });
  assert.equal(laborLines.length, 1);
  assert.equal(laborLines[0]!.total, 25);
  assert.doesNotMatch(JSON.stringify(laborLines), /adjustment|minimum/i);

  const buyLines = holidayDetailedBuyLines({
    targetSubtotal: 45,
    lines: [pricedLine],
  });
  assert.equal(buyLines.reduce((sum, line) => sum + line.total, 0), 45);
  assert.doesNotMatch(JSON.stringify(buyLines), /adjustment|minimum/i);
});

test("labor-only quotes charge installation labor and omit parts", () => {
  const selections = parseHolidaySelections({
    defaultLightStyleKey: style.key,
    installKind: "temporary",
    billingMode: "labor_only",
  });
  const result = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements,
    selections,
    prices,
  });
  assert.equal(result.year1Total, 50);
  assert.equal(result.lines[0]?.partsTotal, 0);
  assert.equal(result.lines[0]?.laborTotal, 50);
  assert.equal(result.lines[0]?.purchaseTotal, 50);

  const lines = holidayDetailedLaborOnlyLines({
    lines: result.lines,
    targetSubtotal: result.optionDetails.buy.subtotal,
  });
  assert.deepEqual(lines.map((line) => line.total), [50]);
  assert.match(lines[0]!.name, /labor only/i);
  assert.match(lines[0]!.description, /customer-supplied/i);
  assert.doesNotMatch(JSON.stringify(lines), /per foot|\/ft/i);
});

test("permanent lights cannot retain labor-only mode", () => {
  const selections = applyHolidayCatalogPolicy(
    parseHolidaySelections({
      defaultLightStyleKey: "permanent",
      installKind: "permanent",
      billingMode: "labor_only",
    }),
    DEFAULT_HOLIDAY_CATALOG
  );
  assert.equal(selections.billingMode, "standard");
});

test("labor-only disclaimer covers third-party materials and replacement visits", () => {
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /not liable/i);
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /clips/i);
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /provided by another company/i);
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /visits to replace lights or strands/i);
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /not included/i);
});
