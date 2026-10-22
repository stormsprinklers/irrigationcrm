import test from "node:test";
import assert from "node:assert/strict";
import { AttributionFirstTouchMethod } from "@prisma/client";
import {
  firstTouchStructuredData,
  normalizeAttribution,
  parseAttributionFromMetadata,
} from "./normalize";

test("parses website tracking fields from nested form metadata", () => {
  const parsed = parseAttributionFromMetadata({
    attribution: {
      gclid: "google-click",
      gbraid: "google-braid",
      wbraid: "web-braid",
      fbc: "facebook-click",
      fbp: "facebook-browser",
      user_agent: "Test Browser",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "holiday-lights",
      utm_content: "hero-form",
      utm_term: "christmas lights",
    },
  });

  assert.deepEqual(parsed, {
    source: "google",
    medium: "cpc",
    campaign: "holiday-lights",
    term: "christmas lights",
    content: "hero-form",
    sourceBucket: null,
    gclid: "google-click",
    gbraid: "google-braid",
    wbraid: "web-braid",
    fbc: "facebook-click",
    fbp: "facebook-browser",
    userAgent: "Test Browser",
    fbclid: null,
    msclkid: null,
    trackingSource: null,
    conversionPage: null,
    landingPage: null,
  });
});

test("keeps every customer tracking value in structured first-touch data", () => {
  const normalized = normalizeAttribution({
    source: "google",
    medium: "cpc",
    campaign: "holiday-lights",
    term: "christmas lights",
    content: "hero-form",
    gclid: "google-click",
    gbraid: "google-braid",
    wbraid: "web-braid",
    fbc: "facebook-click",
    fbp: "facebook-browser",
    userAgent: "Test Browser",
  });
  const occurredAt = new Date("2026-10-21T12:00:00.000Z");
  const data = firstTouchStructuredData(
    normalized,
    AttributionFirstTouchMethod.FORM,
    occurredAt
  );

  assert.equal(data.attributionChannel, "google_ads");
  assert.equal(data.gclid, "google-click");
  assert.equal(data.gbraid, "google-braid");
  assert.equal(data.wbraid, "web-braid");
  assert.equal(data.fbc, "facebook-click");
  assert.equal(data.fbp, "facebook-browser");
  assert.equal(data.userAgent, "Test Browser");
  assert.equal(data.firstTouchAt, occurredAt);
});
