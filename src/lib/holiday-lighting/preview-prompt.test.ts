import test from "node:test";
import assert from "node:assert/strict";
import { lightingPrompt } from "./preview-prompt";
import { DEFAULT_HOLIDAY_CATALOG, holidayDesignOptionsFromQuote, parseHolidayMeasurements, parseHolidaySelections } from "./types";

test("preview instructions control placement without exposing internal quote notes",()=>{
  const option = holidayDesignOptionsFromQuote({measurements:parseHolidayMeasurements({}),selections:parseHolidaySelections({notes:"Private gate code 1234"}),catalog:DEFAULT_HOLIDAY_CATALOG})[0];
  option.previewPrompt = "Red and green on the front porch. Leave trees unlit.";
  const prompt = lightingPrompt(option,DEFAULT_HOLIDAY_CATALOG);
  assert.ok(prompt.includes(option.previewPrompt));
  assert.ok(prompt.includes("take priority"));
  assert.ok(prompt.includes("real roof edges"));
  assert.ok(!prompt.includes("Private gate code"));
  assert.ok(!prompt.includes("transparent mask"));
});
