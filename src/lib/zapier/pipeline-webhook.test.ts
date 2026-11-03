import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { buildZapierPipelinePayload, normalizeZapierWebhookUrl } from "./pipeline-webhook";

const customer = {
  name: "Jordan Lee",
  email: "jordan@example.com",
  phone: "+18015550100",
  city: "Draper",
  state: "UT",
  zip: "84020",
  gclid: "customer-click",
  gbraid: null,
  wbraid: null,
  userAgent: "Customer Browser",
};

test("Zapier conversion payload includes requested fields and blank unavailable values", () => {
  const payload = buildZapierPipelinePayload({
    customer,
    event: {
      id: "event-1",
      stage: "CONVERTED",
      value: new Prisma.Decimal("1299.50"),
      gclid: "event-click",
      gbraid: null,
      wbraid: null,
      userAgent: "Event Browser",
    },
  });

  assert.deepEqual(payload, {
    "First Name": "Jordan",
    "Last Name": "Lee",
    Email: "jordan@example.com",
    Phone: "+18015550100",
    City: "Draper",
    State: "UT",
    Zip: "84020",
    gclid: "event-click",
    gbraid: "",
    wbraid: "",
    user_agent: "Event Browser",
    "Stage Name": "Converted",
    Amount: 1299.5,
  });
});

test("Zapier webhook validation accepts only HTTPS Catch Hook URLs", () => {
  assert.equal(
    normalizeZapierWebhookUrl("https://hooks.zapier.com/hooks/catch/123/abc/"),
    "https://hooks.zapier.com/hooks/catch/123/abc/"
  );
  assert.throws(() => normalizeZapierWebhookUrl("http://hooks.zapier.com/hooks/catch/123/abc/"));
  assert.throws(() => normalizeZapierWebhookUrl("https://example.com/hooks/catch/123/abc/"));
  assert.throws(() => normalizeZapierWebhookUrl("https://hooks.zapier.com/not-a-catch-hook"));
});
