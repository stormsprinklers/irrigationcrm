import assert from "node:assert/strict";
import test from "node:test";
import { computeHolidayQuotePricing, type PriceLookup } from "../pricing";
import {
  DEFAULT_HOLIDAY_CATALOG,
  applyHolidayCatalogPolicy,
  applyHolidayColorPattern,
  holidayCatalogSkus,
  parseHolidayCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "../types";

test("changing an option color updates rooflines, trees, and bushes", () => {
  const measurements = parseHolidayMeasurements({
    segments: [{ id: "roof", label: "Roof", kind: "roofline", path: [], lengthFt: 100 }],
    placements: [
      { id: "tree", label: "Tree", kind: "tree", strandCount: 2, colorPattern: "Warm White" },
      { id: "bush", label: "Bush", kind: "bush", strandCount: 1, colorPattern: "Warm White" },
    ],
  });

  const updated = applyHolidayColorPattern(measurements, "Red");

  assert.deepEqual(updated.segments.map((segment) => segment.colorPattern), ["Red"]);
  assert.deepEqual(updated.placements.map((placement) => placement.colorPattern), ["Red", "Red"]);
});

test("a Multicolor roofline stays Multicolor on the customer quote", () => {
  const measurements = applyHolidayColorPattern(
    parseHolidayMeasurements({
      segments: [
        { id: "roof", label: "Roof", kind: "roofline", path: [], lengthFt: 100 },
      ],
      placements: [],
    }),
    "Multicolor"
  );
  const pricing = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements,
    selections: parseHolidaySelections({
      defaultLightStyleKey: "c9",
      defaultColorPattern: "Multicolor",
    }),
    prices: priceLookup({
      "HL-C9-SERVICE-FT": { unitPrice: 8, unitCost: 3 },
    }),
  });

  assert.equal(pricing.lines[0]?.colorPattern, "Multicolor");
  assert.equal(
    pricing.optionDetails.buy.displayLines[0]?.description,
    "C9 · Multicolor"
  );
});

function priceLookup(overrides: Record<string, { unitPrice: number; unitCost: number }>): PriceLookup {
  return new Map(Object.entries(overrides).map(([sku, value]) => [
    sku,
    { id: sku, name: sku, ...value },
  ]));
}

test("holiday price book separates seasonal service from permanent installation", () => {
  const rows = holidayCatalogSkus(DEFAULT_HOLIDAY_CATALOG);
  assert.deepEqual(rows.map((row) => row.sku), [
    "HL-C9-SERVICE-FT",
    "HL-C7-SERVICE-FT",
    "HL-LIGHTSTREAM-SERVICE-FT",
    "HL-PERM-SERVICE-FT",
    "HL-TREE-SERVICE-STRAND",
    "HL-BUSH-SERVICE-STRAND",
    "HL-WREATH-24-EACH",
    "HL-WREATH-30-EACH",
    "HL-WREATH-36-EACH",
    "HL-WREATH-48-EACH",
    "HL-WREATH-60-EACH",
    "HL-WREATH-72-EACH",
    "HL-GARLAND-9FT-EACH",
    "HL-BOOM-LIFT-EACH",
    "HL-LARGE-LIFT-EACH",
  ]);
  assert.deepEqual(rows.slice(0, 4).map((row) => row.defaultUnitPrice), [4.59, 4.29, 5.99, 25]);
  assert.equal(rows[2]?.defaultUnitCost, 3.99);
  assert.ok(rows.slice(0, 3).every((row) => /service/i.test(row.name)));
  assert.match(rows[3]?.name ?? "", /permanent.*installation/i);
  assert.doesNotMatch(rows[3]?.name ?? "", /service/i);
  assert.ok(rows.slice(4, 6).every((row) => /service/i.test(row.name)));
  assert.ok(rows.every((row) => !/lease|parts|labor/i.test(row.name)));
  assert.deepEqual(rows.slice(6).map((row) => row.defaultUnitCost), [
    41.92, 71, 90.7, 201.39, 314.58, 423.36, 83.06, 0, 0,
  ]);
  assert.deepEqual(rows.slice(6).map((row) => row.defaultUnitPrice), [
    29.34, 49.7, 63.49, 140.97, 220.21, 296.35, 58.14, 399, 699,
  ]);
  assert.ok(rows.slice(6, -2).every((row) => /artificial and pre-lit/i.test(row.description ?? "")));
  assert.ok(rows.slice(6, -2).every((row) => /mounting brackets or fasteners/i.test(row.description ?? "")));
  assert.match(rows.at(-2)?.description ?? "", /boom lift required/i);
  assert.match(rows.at(-1)?.description ?? "", /large lift required/i);
});

test("preset additional items use price-book pricing and material cancellation cost", () => {
  const selections = parseHolidaySelections({
    customServices: [{
      id: "wreath",
      sku: "HL-WREATH-24-EACH",
      name: '24" wreath',
      description: "Artificial and pre-lit.",
      quantity: 2,
      unitPrice: 1,
      unitCost: 1,
    }],
  });
  const prices = priceLookup({
    "HL-WREATH-24-EACH": { unitPrice: 35, unitCost: 41.92 },
  });
  const seasonal = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({}),
    selections,
    prices,
  });

  assert.equal(seasonal.customServicesTotal, 70);
  assert.equal(seasonal.year1Total, 70);
  assert.equal(seasonal.cancellationFee, 83.84);

  const permanent = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({}),
    selections: parseHolidaySelections({ ...selections, defaultLightStyleKey: "permanent" }),
    prices,
  });
  assert.equal(permanent.cancellationFee, 0);
});

test("flat service pricing and cancellation fee use outward price and backend cost", () => {
  const pricing = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({
      segments: [{ id: "roof", label: "Front roof", kind: "roofline", path: [], lengthFt: 100 }],
    }),
    selections: parseHolidaySelections({ defaultLightStyleKey: "c9" }),
    prices: priceLookup({ "HL-C9-SERVICE-FT": { unitPrice: 8, unitCost: 2.5 } }),
  });

  assert.equal(pricing.year1Total, 800);
  assert.equal(pricing.cancellationFee, 250);
  assert.equal(pricing.optionDetails.buy.partsPrice, 0);
  assert.equal(pricing.optionDetails.buy.laborPrice, 800);
  assert.equal(pricing.optionDetails.buy.displayLines.length, 1);
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.name, "Roofline lighting");
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.description, "C9 · Warm White");
  assert.doesNotMatch(pricing.optionDetails.buy.displayLines[0]?.description ?? "", /\b(?:ft|feet|foot)\b/i);
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.total, 800);
  assert.equal(
    pricing.optionDetails.buy.includedLines.some(
      (line) => line.name === "Professional installation"
    ),
    false
  );
});

test("LightStream uses its own outward rate, cancellation cost, and estimate label", () => {
  const pricing = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({
      segments: [{
        id: "roof",
        label: "Front roof",
        kind: "roofline",
        path: [],
        lengthFt: 100,
        lightStyleKey: "lightstream",
        colorPattern: "Multicolor",
      }],
    }),
    selections: parseHolidaySelections({
      defaultLightStyleKey: "lightstream",
      defaultColorPattern: "Multicolor",
    }),
    prices: priceLookup({
      "HL-LIGHTSTREAM-SERVICE-FT": { unitPrice: 5.99, unitCost: 3.99 },
    }),
  });

  assert.equal(pricing.year1Total, 599);
  assert.equal(pricing.cancellationFee, 399);
  assert.equal(
    pricing.optionDetails.buy.displayLines[0]?.description,
    "LightStream (Color-Changing) · Multicolor"
  );
});

test("holiday job minimum raises service price without raising cancellation cost", () => {
  const catalog = parseHolidayCatalog({
    ...DEFAULT_HOLIDAY_CATALOG,
    quoteDefaults: {
      ...DEFAULT_HOLIDAY_CATALOG.quoteDefaults,
      temporaryYear1Minimum: 750,
    },
  });
  const pricing = computeHolidayQuotePricing({
    catalog,
    measurements: parseHolidayMeasurements({
      segments: [{ id: "roof", label: "Roof", kind: "roofline", path: [], lengthFt: 20 }],
    }),
    selections: parseHolidaySelections({ defaultLightStyleKey: "c9" }),
    prices: priceLookup({ "HL-C9-SERVICE-FT": { unitPrice: 5, unitCost: 2 } }),
  });

  assert.equal(pricing.year1Total, 750);
  assert.equal(pricing.cancellationFee, 40);
  assert.equal(pricing.year1MinimumApplied, true);
  assert.deepEqual(
    pricing.optionDetails.buy.displayLines.map((line) => ({ name: line.name, total: line.total })),
    [{ name: "Roofline lighting", total: 750 }]
  );
});

test("permanent lighting is an installed purchase with no cancellation fee", () => {
  const pricing = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({
      segments: [{ id: "roof", label: "Roof", kind: "roofline", path: [], lengthFt: 100 }],
    }),
    selections: parseHolidaySelections({ defaultLightStyleKey: "permanent" }),
    prices: priceLookup({ "HL-PERM-SERVICE-FT": { unitPrice: 25, unitCost: 9 } }),
  });

  assert.equal(pricing.permanentTotal, 2_500);
  assert.equal(pricing.cancellationFee, 0);
  assert.equal(
    pricing.optionDetails.permanent.displayLines[0]?.name,
    "Roofline lighting"
  );
  assert.equal(pricing.optionDetails.permanent.displayLines[0]?.description, "Permanent · Warm White");
  assert.doesNotMatch(
    pricing.optionDetails.permanent.displayLines[0]?.description ?? "",
    /\b(?:ft|feet|foot)\b/i
  );
  assert.doesNotMatch(
    pricing.optionDetails.permanent.includedLines.map((line) => line.description).join(" "),
    /recurring service/i
  );
});

test("tree difficulty multiplies outward price but not material cancellation cost", () => {
  const pricing = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({
      placements: [{
        id: "tree", kind: "tree", size: "small", label: "Front tree",
        latLng: { lat: 40, lng: -111 }, strandCount: 2, difficulty: 3,
      }],
    }),
    selections: parseHolidaySelections({}),
    prices: priceLookup({ "HL-TREE-SERVICE-STRAND": { unitPrice: 100, unitCost: 35 } }),
  });

  assert.equal(pricing.year1Total, 300);
  assert.equal(pricing.cancellationFee, 70);
  assert.match(pricing.lines[0]?.staffDetail ?? "", /1\.5×/);
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.name, "Tree lighting");
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.description, "Mini LEDs · Warm White");
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.total, 300);
});

test("customer quote groups all rooflines, trees, and bushes into category lines without footage", () => {
  const pricing = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({
      segments: [
        { id: "roof-front", label: "Front roofline", kind: "roofline", path: [], lengthFt: 60 },
        { id: "roof-peak", label: "Front peak", kind: "roofline", path: [], lengthFt: 40 },
      ],
      placements: [
        {
          id: "tree", kind: "tree", size: "small", label: "Front tree",
          latLng: { lat: 40, lng: -111 }, strandCount: 2, difficulty: 1,
        },
        {
          id: "bush", kind: "bush", size: "small", label: "Entry bushes",
          latLng: { lat: 40, lng: -111 }, strandCount: 3, difficulty: 1,
        },
      ],
    }),
    selections: parseHolidaySelections({ defaultLightStyleKey: "c9" }),
    prices: priceLookup({
      "HL-C9-SERVICE-FT": { unitPrice: 8, unitCost: 2.5 },
      "HL-TREE-SERVICE-STRAND": { unitPrice: 100, unitCost: 35 },
      "HL-BUSH-SERVICE-STRAND": { unitPrice: 50, unitCost: 20 },
    }),
  });

  assert.deepEqual(
    pricing.optionDetails.buy.displayLines.map((line) => ({
      name: line.name,
      description: line.description,
      total: line.total,
    })),
    [
      { name: "Roofline lighting", description: "C9 · Warm White", total: 800 },
      { name: "Tree lighting", description: "Mini LEDs · Warm White", total: 200 },
      { name: "Bush lighting", description: "Mini LEDs · Warm White", total: 150 },
    ]
  );
  assert.doesNotMatch(
    pricing.optionDetails.buy.displayLines.map((line) => line.description).join(" "),
    /\b(?:ft|feet|foot)\b/i
  );
  assert.equal(
    pricing.optionDetails.buy.displayLines.reduce((sum, line) => sum + line.total, 0),
    pricing.optionDetails.buy.subtotal
  );
});

test("legacy catalogs and lease/labor selections migrate to the service model", () => {
  const catalog = parseHolidayCatalog({
    lightStyles: [
      { ...DEFAULT_HOLIDAY_CATALOG.lightStyles[0], partsSku: "OLD-PARTS", leaseSku: "OLD-LEASE" },
      DEFAULT_HOLIDAY_CATALOG.lightStyles[1],
      DEFAULT_HOLIDAY_CATALOG.lightStyles.find((style) => style.key === "permanent")!,
    ],
  });
  assert.equal(catalog.lightStyles[0]?.partsSku, "HL-C9-SERVICE-FT");
  assert.equal(catalog.lightStyles.some((style) => style.key === "lightstream"), true);
  assert.equal(applyHolidayCatalogPolicy(parseHolidaySelections({ pricingMode: "lease" }), catalog).pricingMode, "buy");
  assert.equal(applyHolidayCatalogPolicy(parseHolidaySelections({ pricingMode: "labor", billingMode: "labor_only" }), catalog).pricingMode, "buy");
});

test("manual flat price and discounts work without a parts/labor breakdown", () => {
  const pricing = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({
      segments: [{ id: "roof", label: "Roof", kind: "roofline", path: [], lengthFt: 50 }],
    }),
    selections: parseHolidaySelections({
      optionAdjustments: {
        buy: { price: 600, discountType: "fixed", discountAmount: 75, discountLabel: "Early booking" },
      },
    }),
    prices: priceLookup({ "HL-C9-SERVICE-FT": { unitPrice: 10, unitCost: 2 } }),
  });
  assert.equal(pricing.optionDetails.buy.subtotal, 600);
  assert.equal(pricing.optionDetails.buy.discountTotal, 75);
  assert.equal(pricing.optionDetails.buy.total, 525);
  assert.equal(pricing.cancellationFee, 100);
  assert.deepEqual(
    pricing.optionDetails.buy.displayLines.map((line) => ({ name: line.name, total: line.total })),
    [{ name: "Roofline lighting", total: 600 }]
  );
});

test("itemized backend materials use MSRP for cancellation and contractor cost for job costing", () => {
  const selections = parseHolidaySelections({ defaultLightStyleKey: "c9" });
  const measurements = parseHolidayMeasurements({
    segments: [{ id: "roof", label: "Roofline", lengthFt: 10 }],
  });
  const prices: PriceLookup = new Map([
    ["HL-C9-SERVICE-FT", {
      id: "c9",
      name: "C9 service",
      unitPrice: 5,
      unitCost: 0,
      backendItems: [
        { id: "bulbs", name: "Bulbs", quantity: 1, contractorCost: 1, msrp: 2 },
        { id: "timer", name: "Timer", quantity: 0.1, contractorCost: 5, msrp: 10 },
      ],
    }],
  ]);

  const result = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements,
    selections,
    prices,
  });

  assert.equal(result.cancellationFee, 30);
  assert.equal(result.contractorMaterialCost, 15);
  assert.deepEqual(result.backendCostItems.map((item) => [item.name, item.quantity, item.msrpTotal, item.contractorTotal]), [
    ["Bulbs", 10, 20, 10],
    ["Timer", 1, 10, 5],
  ]);
});
