import assert from "node:assert/strict";
import test from "node:test";
import { buildBulbPrepRequirements } from "./requirements";

test("bulb prep requirements expose only type, color, and footage", () => {
  const requirements = buildBulbPrepRequirements({
    source: "holiday-lighting-quote",
    strandMap: {
      version: 1,
      marginPct: 10,
      center: null,
      features: [
        {
          id: "front",
          label: "Front",
          color: "#fff",
          paths: [],
          lengthFt: 40,
          lengthFtWithMargin: 44,
          lightStyleKey: "c9",
          lightStyleLabel: "C9",
          bulbColors: "Red / Warm White",
          purchaseTotal: 900,
          leaseTotal: 500,
          kind: "strand",
        },
        {
          id: "garage",
          label: "Garage",
          color: "#eee",
          paths: [],
          lengthFt: 20,
          lengthFtWithMargin: 22,
          lightStyleKey: "c9",
          lightStyleLabel: "C9",
          bulbColors: "Red / Warm White",
          purchaseTotal: 450,
          leaseTotal: 250,
          kind: "strand",
        },
      ],
    },
  }, { bulbColor: "Warm White", linearFeet: 60 });

  assert.deepEqual(requirements, [{
    bulbType: "C9",
    bulbColor: "Red / Warm White",
    linearFeet: 66,
  }]);
  assert.equal("purchaseTotal" in requirements[0]!, false);
  assert.equal("leaseTotal" in requirements[0]!, false);
});

test("bulb prep requirements fall back to the approved visit summary", () => {
  assert.deepEqual(
    buildBulbPrepRequirements(null, { bulbColor: "Blue", linearFeet: 120 }),
    [{ bulbType: "Bulbs", bulbColor: "Blue", linearFeet: 120 }]
  );
});
