import test from "node:test";
import assert from "node:assert/strict";
import { planIncludesWinterization } from "../visits";

test("FALL visit templates count as winterization", () => {
  assert.equal(
    planIncludesWinterization({
      visitTemplates: [{ season: "FALL", name: "Fall Winterization", visitTitle: "Fall system winterization" }],
    }),
    true
  );
});

test("spring-only plans do not count as winterization", () => {
  assert.equal(
    planIncludesWinterization({
      visitTemplates: [{ season: "SPRING", name: "Spring Activation", visitTitle: "Spring system activation" }],
    }),
    false
  );
});

test("selected winterization addon counts even without a FALL visit", () => {
  assert.equal(
    planIncludesWinterization({
      visitTemplates: [{ season: "SPRING", name: "Spring", visitTitle: "Start up" }],
      addons: [{ id: "a1", name: "Winterization add-on" }],
      selectedAddonIds: ["a1"],
    }),
    true
  );
});
