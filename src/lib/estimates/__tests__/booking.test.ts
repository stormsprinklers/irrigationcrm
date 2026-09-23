import test from "node:test";
import assert from "node:assert/strict";
import { DepositType } from "@prisma/client";
import { computeDepositAmount } from "../booking";

test("estimate deposits are only due above the configured threshold", () => {
  const policy = {
    depositRequired: true,
    depositType: DepositType.PERCENT,
    depositAmount: 50,
    depositThreshold: 999,
  };

  assert.equal(computeDepositAmount({ ...policy, total: 999 }), 0);
  assert.equal(computeDepositAmount({ ...policy, total: 1000 }), 500);
});

test("estimate deposit percentage and threshold are configurable", () => {
  assert.equal(
    computeDepositAmount({
      total: 1500,
      depositRequired: true,
      depositType: DepositType.PERCENT,
      depositAmount: 25,
      depositThreshold: 1499,
    }),
    375
  );
});

test("disabled estimate deposit policy does not collect a deposit", () => {
  assert.equal(
    computeDepositAmount({
      total: 5000,
      depositRequired: false,
      depositType: DepositType.PERCENT,
      depositAmount: 50,
      depositThreshold: 999,
    }),
    0
  );
});
