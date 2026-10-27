import test from "node:test";
import assert from "node:assert/strict";
import {
  extractWebsiteFormResponses,
  websiteFormDetailLines,
} from "./form-details";

test("formats arbitrary GHL form fields without repeating tracking identifiers", () => {
  const metadata = {
    facebook_lead_id: "123456789",
    utm_source: "facebook",
    form_fields: {
      property_type: "Two story home",
      desired_timeline: "Within 30 days",
      preferred_colors: ["Warm white", "Green"],
    },
  };

  assert.deepEqual(extractWebsiteFormResponses(metadata, "meta-instant"), [
    { key: "property_type", label: "Property type", value: "Two story home" },
    { key: "desired_timeline", label: "Desired timeline", value: "Within 30 days" },
    { key: "preferred_colors", label: "Preferred colors", value: "Warm white, Green" },
  ]);
  assert.doesNotMatch(websiteFormDetailLines(metadata, "meta-instant").join("\n"), /123456789/);
});

test("supports Meta field_data answer arrays", () => {
  const responses = extractWebsiteFormResponses(
    {
      field_data: [
        { name: "full_name", values: ["Taylor Customer"] },
        { name: "how_many_trees", values: ["4"] },
      ],
    },
    "facebook-lead-form"
  );

  assert.deepEqual(responses, [
    { key: "how_many_trees", label: "How many trees", value: "4" },
  ]);
});
