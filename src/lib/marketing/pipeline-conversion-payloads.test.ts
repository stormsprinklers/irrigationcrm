import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleDataManagerEvent } from "@/lib/google-ads/data-manager";
import { buildMetaPipelineEvent, type PipelineConversionPayloadInput } from "@/lib/meta/conversions-api";

function event(
  stage: PipelineConversionPayloadInput["stage"],
  value: number | null
): PipelineConversionPayloadInput & { eventSource: string } {
  return {
    id: `event-${stage}`,
    customerId: "customer-1",
    stage,
    occurredAt: new Date("2026-10-22T18:30:00.000Z"),
    value,
    currency: "USD",
    emailSha256: "a".repeat(64),
    phoneSha256: "b".repeat(64),
    gclid: "google-click",
    gbraid: null,
    wbraid: null,
    fbc: "fb.1.click",
    fbp: "fb.1.browser",
    metaLeadId: "1485075230355177",
    userAgent: "Example Browser",
    eventSource: "WEB",
  };
}

test("Google omits value for Lead and includes full value for Converted", () => {
  const lead = buildGoogleDataManagerEvent(event("LEAD", null));
  assert.equal("conversionValue" in lead, false);
  assert.equal(lead.eventSource, "WEB");
  assert.equal(lead.transactionId, "crm-pipeline-event-LEAD");

  const converted = buildGoogleDataManagerEvent(event("CONVERTED", 4200.5));
  assert.equal(converted.conversionValue, 4200.5);
  assert.equal(converted.currency, "USD");
  const adIdentifiers = converted.adIdentifiers as {
    gclid?: string;
    landingPageDeviceInfo?: { userAgent?: string };
  };
  assert.equal(adIdentifiers.gclid, "google-click");
  assert.equal(adIdentifiers.landingPageDeviceInfo?.userAgent, "Example Browser");
});

test("Meta uses custom middle-funnel events and standard Lead/Purchase events", () => {
  assert.equal(buildMetaPipelineEvent(event("LEAD", null)).event_name, "Lead");
  assert.equal(buildMetaPipelineEvent(event("QUALIFIED", null)).event_name, "QualifiedLead");
  assert.equal(buildMetaPipelineEvent(event("CONVERTED", 4200)).event_name, "ConvertedLead");
  const sold = buildMetaPipelineEvent(event("SOLD", 4200));
  assert.equal(sold.event_name, "Purchase");
  assert.equal(sold.custom_data.value, 4200);
  assert.equal(sold.custom_data.currency, "USD");
  assert.equal(sold.user_data.fbc, "fb.1.click");
  assert.equal(sold.user_data.fbp, "fb.1.browser");
  assert.equal(sold.user_data.lead_id, "1485075230355177");
});
