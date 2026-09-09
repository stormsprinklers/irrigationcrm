import test from "node:test";
import assert from "node:assert/strict";
import { prefixOutboundSmsWithCompanyName } from "../sms-company-prefix";

test("prefixes the company name and a colon", () => {
  assert.equal(
    prefixOutboundSmsWithCompanyName("Storm Sprinklers", "Your technician is on the way."),
    "Storm Sprinklers: Your technician is on the way."
  );
});

test("does not double-prefix when the body already starts with Company:", () => {
  assert.equal(
    prefixOutboundSmsWithCompanyName(
      "Storm Sprinklers",
      "Storm Sprinklers: Please use this secure link."
    ),
    "Storm Sprinklers: Please use this secure link."
  );
});

test("does not prefix when the body already starts with the company name", () => {
  assert.equal(
    prefixOutboundSmsWithCompanyName("Storm Sprinklers", "Storm Sprinklers login code: 123456."),
    "Storm Sprinklers login code: 123456."
  );
});

test("leaves empty and whitespace-only bodies unchanged", () => {
  assert.equal(prefixOutboundSmsWithCompanyName("Storm Sprinklers", ""), "");
  assert.equal(prefixOutboundSmsWithCompanyName("Storm Sprinklers", "   "), "   ");
});

test("uses the company record name, including other brands", () => {
  assert.equal(
    prefixOutboundSmsWithCompanyName("Chestnut & Cheer", "Your install is tomorrow."),
    "Chestnut & Cheer: Your install is tomorrow."
  );
});
