import test from "node:test";
import assert from "node:assert/strict";
import { formatPoliciesForPrompt, scorePolicyMatch, type StormAiPolicyDto } from "../policies-shared";

function policy(partial: Partial<StormAiPolicyDto>): StormAiPolicyDto {
  return {
    id: partial.id ?? "1",
    title: partial.title ?? "Discounts",
    category: partial.category ?? "Discounts",
    description: partial.description ?? "Managers may approve up to 10%.",
    active: partial.active ?? true,
    sortOrder: partial.sortOrder ?? 0,
  };
}

test("scorePolicyMatch prefers title hits over body hits", () => {
  const discounts = policy({ title: "Discount approval", description: "See a manager." });
  const callbacks = policy({
    id: "2",
    title: "Callbacks",
    category: "Callbacks",
    description: "If a discount is mentioned, still treat it as a callback policy.",
  });
  assert.ok(scorePolicyMatch(discounts, "discount") > scorePolicyMatch(callbacks, "discount"));
});

test("formatPoliciesForPrompt tells the model not to invent rules when empty", () => {
  assert.match(formatPoliciesForPrompt([]), /none are configured/i);
});
