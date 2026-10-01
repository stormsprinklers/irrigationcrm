import test from "node:test";
import assert from "node:assert/strict";
import {
  computeHolidayQuotePricing,
  HOLIDAY_LABOR_ONLY_DISCLAIMER,
  HOLIDAY_INCLUDED_LINES,
  HOLIDAY_PERMANENT_INCLUDED_LINES,
  holidayBuyBreakdownLines,
  holidayDetailedBuyLines,
  holidayDetailedLaborOnlyLines,
  holidayOptionSummary,
} from "../pricing";
import {
  DEFAULT_HOLIDAY_CATALOG,
  applyHolidayCatalogPolicy,
  holidayDesignOptionsFromQuote,
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

test("buy breakdown treats the future-year service amount as labor and the remainder as parts", () => {
  const lines = holidayBuyBreakdownLines({
    year1Subtotal: 1_250,
    year2LaborTotal: 475,
  });
  assert.deepEqual(
    lines.map(({ name, total }) => ({ name, total })),
    [
      { name: "Parts", total: 775 },
      { name: "Labor", total: 475 },
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

test("detailed buy lines explain future-year labor without per-foot pricing", () => {
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
  assert.equal(lines[1]!.name, "Roofline — labor");
  assert.match(lines[1]!.description, /In future years, since you already own the lights/);
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
    { name: "Roofline — labor", total: 59.8 },
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

test("legacy labor-only quotes become an additional option without replacing the default", () => {
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
  assert.equal(selections.billingMode, "labor_only");
  assert.equal(result.year1Total, 150);
  assert.equal(result.lines[0]?.partsTotal, 100);
  assert.equal(result.lines[0]?.laborTotal, 50);
  assert.equal(result.lines[0]?.purchaseTotal, 150);
  assert.equal(result.optionDetails.labor.total, 50);
  assert.equal(result.optionDetails.buy.total, 150);

  const lines = holidayDetailedLaborOnlyLines({
    lines: result.lines,
    targetSubtotal: result.optionDetails.labor.subtotal,
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
      includeLaborOnlyOption: true,
      includePermanentOption: true,
    }),
    DEFAULT_HOLIDAY_CATALOG
  );
  assert.equal(selections.billingMode, "standard");
  assert.equal(selections.includeLaborOnlyOption, false);
  assert.equal(selections.includePermanentOption, false);
});

test("temporary quotes retain optional labor-only and permanent customer options", () => {
  const selections = applyHolidayCatalogPolicy(
    parseHolidaySelections({
      defaultLightStyleKey: style.key,
      includeLaborOnlyOption: true,
      includePermanentOption: true,
      optionAdjustments: {
        labor: { price: 45, discountLabel: "Returning customer", discountType: "fixed", discountAmount: 5 },
        buy: { price: 140 },
        permanent: { price: 250 },
      },
    }),
    DEFAULT_HOLIDAY_CATALOG
  );
  const result = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements,
    selections,
    prices,
  });
  assert.equal(selections.billingMode, "standard");
  assert.equal(selections.includeLaborOnlyOption, true);
  assert.equal(selections.includePermanentOption, true);
  assert.equal(result.optionDetails.labor.total, 40);
  assert.equal(result.optionDetails.buy.total, 140);
  assert.equal(result.optionDetails.permanent.total, 250);
  assert.equal(result.year1Total, 140);
});

test("legacy labor-only selection migrates to a standard quote with labor-only offered", () => {
  const selections = applyHolidayCatalogPolicy(
    parseHolidaySelections({
      defaultLightStyleKey: style.key,
      billingMode: "labor_only",
    }),
    DEFAULT_HOLIDAY_CATALOG
  );
  assert.equal(selections.billingMode, "standard");
  assert.equal(selections.includeLaborOnlyOption, true);
});

test("labor-only disclaimer covers third-party materials and replacement visits", () => {
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /not liable/i);
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /clips/i);
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /provided by another company/i);
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /visits to replace lights or strands/i);
  assert.match(HOLIDAY_LABOR_ONLY_DISCLAIMER, /not included/i);
});

test("quote design options preserve independent scope and measurements and cap at five", () => {
  const rawOptions = Array.from({ length: 6 }, (_, index) => ({
    id: `design-${index + 1}`,
    label: `Option ${index + 1}`,
    measurements: {
      segments: [{ ...measurements.segments[0], id: `roof-${index + 1}`, lengthFt: 10 + index }],
      placements: index === 2
        ? [{ id: "tree-1", kind: "tree", size: "medium", label: "Tree 1", latLng: { lat: 0, lng: 0 } }]
        : [],
    },
    selections: {
      defaultLightStyleKey: index === 3 ? "permanent" : "c9",
      pricingMode: index === 0 ? "labor" : "buy",
      defaultColorPattern: index === 1 ? "Red" : "Warm White",
      notes: index === 1 ? "Customer-facing option note" : undefined,
    },
  }));
  const parsed = parseHolidaySelections({ designOptions: rawOptions, activeDesignOptionId: "design-2" });
  const options = holidayDesignOptionsFromQuote({
    measurements,
    selections: parsed,
    catalog: DEFAULT_HOLIDAY_CATALOG,
  });
  assert.equal(options.length, 5);
  assert.equal(options[0]?.selections.pricingMode, "labor");
  assert.equal(options[1]?.selections.defaultColorPattern, "Red");
  assert.equal(options[1]?.selections.notes, "Customer-facing option note");
  assert.equal(options[2]?.measurements.placements.length, 1);
  assert.equal(options[3]?.selections.pricingMode, "permanent");
  assert.equal(parsed.activeDesignOptionId, "design-2");
});

test("customer-facing holiday summaries never expose roofline footage", () => {
  const summary = holidayOptionSummary({
    placementCount: 2,
    styleLabel: "C9 Warm White",
  });
  assert.match(summary, /C9 Warm White roofline lighting/);
  assert.doesNotMatch(summary, /\bft\b|feet|foot/i);
});

test("permanent-light fixed discounts retain the exact entered amount", () => {
  const selections = parseHolidaySelections({
    defaultLightStyleKey: "permanent",
    pricingMode: "permanent",
    optionAdjustments: {
      permanent: { price: 13_175, discountType: "fixed", discountAmount: 1_000 },
    },
  });
  const result = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements,
    selections,
    prices,
  });
  assert.equal(result.optionDetails.permanent.subtotal, 13_175);
  assert.equal(result.optionDetails.permanent.discountTotal, 1_000);
  assert.equal(result.optionDetails.permanent.total, 12_175);
});

test("included holiday services have customer descriptions and permanent coverage is five years", () => {
  assert.match(HOLIDAY_INCLUDED_LINES[0].description, /warehouse/i);
  assert.match(HOLIDAY_INCLUDED_LINES[1].description, /48 hours/i);
  assert.match(HOLIDAY_INCLUDED_LINES[2].name, /3-year parts and labor/i);
  assert.match(HOLIDAY_PERMANENT_INCLUDED_LINES[2].name, /5-year parts and labor/i);
  assert.match(HOLIDAY_PERMANENT_INCLUDED_LINES[2].description, /no cost/i);
});
