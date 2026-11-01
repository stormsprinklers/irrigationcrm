import assert from "node:assert/strict";
import test from "node:test";
import { computeHolidayQuotePricing, type PriceLookup } from "../pricing";
import {
  DEFAULT_HOLIDAY_CATALOG,
  applyHolidayCatalogPolicy,
  holidayCatalogSkus,
  parseHolidayCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
} from "../types";

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
    "HL-PERM-SERVICE-FT",
    "HL-TREE-SERVICE-STRAND",
    "HL-BUSH-SERVICE-STRAND",
  ]);
  assert.deepEqual(rows.slice(0, 3).map((row) => row.defaultUnitPrice), [4.59, 4.29, 25]);
  assert.ok(rows.slice(0, 2).every((row) => /service/i.test(row.name)));
  assert.match(rows[2]?.name ?? "", /permanent.*installation/i);
  assert.doesNotMatch(rows[2]?.name ?? "", /service/i);
  assert.ok(rows.slice(3).every((row) => /service/i.test(row.name)));
  assert.ok(rows.every((row) => !/lease|parts|labor/i.test(row.name)));
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
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.name, "Front roof");
  assert.match(pricing.optionDetails.buy.displayLines[0]?.description ?? "", /100 ft/i);
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.total, 800);
  assert.equal(
    pricing.optionDetails.buy.includedLines.some(
      (line) => line.name === "Professional installation"
    ),
    false
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
    [{ name: "Roof", total: 750 }]
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
    "Roof"
  );
  assert.match(
    pricing.optionDetails.permanent.displayLines[0]?.description ?? "",
    /100 ft/i
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
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.name, "Front tree");
  assert.match(pricing.optionDetails.buy.displayLines[0]?.description ?? "", /2 strands/i);
  assert.equal(pricing.optionDetails.buy.displayLines[0]?.total, 300);
});

test("rooflines, trees, and bushes remain separate customer quote lines", () => {
  const pricing = computeHolidayQuotePricing({
    catalog: DEFAULT_HOLIDAY_CATALOG,
    measurements: parseHolidayMeasurements({
      segments: [{ id: "roof", label: "Front roofline", kind: "roofline", path: [], lengthFt: 100 }],
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
      { name: "Front roofline", description: "100 ft", total: 800 },
      { name: "Front tree", description: "2 strands · Warm White", total: 200 },
      { name: "Entry bushes", description: "3 strands · Warm White", total: 150 },
    ]
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
      DEFAULT_HOLIDAY_CATALOG.lightStyles[2],
    ],
  });
  assert.equal(catalog.lightStyles[0]?.partsSku, "HL-C9-SERVICE-FT");
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
    [{ name: "Roof", total: 600 }]
  );
});
