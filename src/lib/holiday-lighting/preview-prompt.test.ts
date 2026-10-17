import test from "node:test";
import assert from "node:assert/strict";
import { lightingPrompt } from "./preview-prompt";
import { DEFAULT_HOLIDAY_CATALOG, holidayDesignOptionsFromQuote, parseHolidayMeasurements, parseHolidaySelections } from "./types";

test("painted lines alone control placement without exposing internal quote notes",()=>{
  const option = holidayDesignOptionsFromQuote({measurements:parseHolidayMeasurements({}),selections:parseHolidaySelections({notes:"Private gate code 1234"}),catalog:DEFAULT_HOLIDAY_CATALOG})[0];
  const prompt = lightingPrompt(option,DEFAULT_HOLIDAY_CATALOG);
  assert.ok(prompt.includes("painted guide lines"));
  assert.ok(prompt.includes("only places"));
  assert.ok(prompt.includes("do not use quote measurements"));
  assert.ok(!prompt.includes("Private gate code"));
});
