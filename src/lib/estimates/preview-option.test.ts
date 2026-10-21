import test from "node:test";
import assert from "node:assert/strict";
import { defaultEstimatePreviewOption, estimatePreviewTotals } from "./preview-option";

test("estimate send preview opens on the selected option instead of the first option", () => {
  const options = [
    { id: "low", subtotal: 2_000, discountTotal: 0, total: 2_000 },
    { id: "selected", subtotal: 5_500, discountTotal: 0, total: 5_500 },
  ];

  assert.equal(defaultEstimatePreviewOption(options, "selected")?.id, "selected");
});

test("estimate send preview takes subtotal, discount and total from one option", () => {
  const displayed = estimatePreviewTotals(
    { subtotal: 2_000, discountTotal: 0, total: 2_000 },
    { id: "other", subtotal: 5_500, discountTotal: 500, total: 5_000 }
  );

  assert.deepEqual(displayed, {
    subtotal: 5_500,
    discountTotal: 500,
    total: 5_000,
  });
});
