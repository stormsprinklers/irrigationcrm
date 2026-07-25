import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedUtilityBillUpload,
  isTerminalPortStatus,
  isTollFreeNumberType,
  isUsLocalE164,
  pinRequiredForPort,
} from "../porting";

test("US local E.164 acceptance", () => {
  assert.equal(isUsLocalE164("+18015551212"), true);
  assert.equal(isUsLocalE164("+18005551212"), true);
  assert.equal(isUsLocalE164("+441234567890"), false);
  assert.equal(isUsLocalE164("8015551212"), false);
});

test("toll-free number type blocked", () => {
  assert.equal(isTollFreeNumberType("tollFree"), true);
  assert.equal(isTollFreeNumberType("TOLL_FREE"), true);
  assert.equal(isTollFreeNumberType("local"), false);
  assert.equal(isTollFreeNumberType("mobile"), false);
});

test("PIN required for mobile or carrier flag", () => {
  assert.equal(pinRequiredForPort(true, "local"), true);
  assert.equal(pinRequiredForPort(false, "MOBILE"), true);
  assert.equal(pinRequiredForPort(false, "local"), false);
});

test("utility bill upload rules", () => {
  assert.equal(
    isAllowedUtilityBillUpload({
      filename: "bill.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    }).ok,
    true
  );
  assert.equal(
    isAllowedUtilityBillUpload({
      filename: "bill.exe",
      mimeType: "application/octet-stream",
      sizeBytes: 1024,
    }).ok,
    false
  );
  assert.equal(
    isAllowedUtilityBillUpload({
      filename: "bill.pdf",
      mimeType: "application/pdf",
      sizeBytes: 11 * 1024 * 1024,
    }).ok,
    false
  );
});

test("terminal port statuses", () => {
  assert.equal(isTerminalPortStatus("Completed"), true);
  assert.equal(isTerminalPortStatus("canceled"), true);
  assert.equal(isTerminalPortStatus("Waiting For Signature"), false);
  assert.equal(isTerminalPortStatus("In Review"), false);
});
