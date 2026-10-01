import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { buildMetaCrmLeadEvent } from "../conversions-api";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("buildMetaCrmLeadEvent hashes customer data and preserves Meta matching IDs", () => {
  const event = buildMetaCrmLeadEvent({
    leadId: "lead-123",
    name: "Jane Doe",
    phone: "(801) 555-0100",
    email: " JANE@EXAMPLE.COM ",
    city: "Spanish Fork",
    eventTime: new Date("2026-10-01T12:00:00.000Z"),
    metadata: {
      metaEvent: {
        eventId: "winterization-event-123",
        fbp: "fb.1.123.456",
        fbc: "fb.1.123.click",
        eventSourceUrl: "https://www.stormsprinklers.com/meta-sprinkler-winterization",
        postalCode: "84660",
        clientIpAddress: "203.0.113.10",
        clientUserAgent: "Example Browser",
      },
    },
  });

  assert.equal(event.event_name, "Lead");
  assert.equal(event.action_source, "system_generated");
  assert.equal(event.event_id, "winterization-event-123");
  assert.equal(event.custom_data.event_source, "crm");
  assert.equal(event.user_data.em[0], hash("jane@example.com"));
  assert.equal(event.user_data.ph[0], hash("18015550100"));
  assert.equal(event.user_data.fn[0], hash("jane"));
  assert.equal(event.user_data.ln[0], hash("doe"));
  assert.equal(event.user_data.ct[0], hash("spanishfork"));
  assert.equal(event.user_data.zp[0], hash("84660"));
  assert.equal(event.user_data.fbp, "fb.1.123.456");
});
