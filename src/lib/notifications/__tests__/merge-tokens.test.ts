import test from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "../templates";
import {
  findMergeTokenAt,
  formatMergeToken,
  replaceMergeTokenFallback,
  unwrapMergeTokenSpans,
} from "../merge-tokens";

test("formatMergeToken omits empty fallbacks", () => {
  assert.equal(formatMergeToken("customer_first_name"), "{customer_first_name}");
  assert.equal(formatMergeToken("customer_first_name", "there"), "{customer_first_name|there}");
});

test("findMergeTokenAt locates a token under the caret", () => {
  const text = "Hi {customer_first_name|there}, thanks";
  const hit = findMergeTokenAt(text, 8);
  assert.equal(hit?.key, "customer_first_name");
  assert.equal(hit?.fallback, "there");
});

test("replaceMergeTokenFallback updates one occurrence", () => {
  const text = "Hi {customer_first_name}, at {customer_address}";
  const hit = findMergeTokenAt(text, 4);
  assert.ok(hit);
  assert.equal(
    replaceMergeTokenFallback(text, hit, "there"),
    "Hi {customer_first_name|there}, at {customer_address}"
  );
});

test("renderTemplate uses fallback when the value is missing", () => {
  const out = renderTemplate("Hi {customer_first_name|there} at {customer_address|your home}", {
    customer_first_name: "",
    customer_address: null,
  });
  assert.equal(out, "Hi there at your home");
});

test("renderTemplate keeps the real value when present", () => {
  const out = renderTemplate("Hi {customer_first_name|there}", {
    customer_first_name: "Jane",
  });
  assert.equal(out, "Hi Jane");
});

test("unwrapMergeTokenSpans leaves the token text", () => {
  const html =
    '<p><span data-merge-token="customer_first_name" data-merge-fallback="there">{customer_first_name|there}</span></p>';
  assert.equal(unwrapMergeTokenSpans(html), "<p>{customer_first_name|there}</p>");
});
