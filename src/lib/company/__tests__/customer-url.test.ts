import test from "node:test";
import assert from "node:assert/strict";
import {
  customerBookingUrl,
  customerRadarBookingUrl,
  parsePublicHttpUrl,
} from "../customer-url";
import { clampOnlineBookingSlotMinutes } from "../../booking/slot-minutes";

test("parsePublicHttpUrl keeps a booking path and strips a trailing slash", () => {
  assert.equal(
    parsePublicHttpUrl("www.stormsprinklers.com/booking"),
    "https://www.stormsprinklers.com/booking"
  );
  assert.equal(
    parsePublicHttpUrl("https://www.stormsprinklers.com/booking/"),
    "https://www.stormsprinklers.com/booking"
  );
  assert.equal(parsePublicHttpUrl(""), null);
});

test("parsePublicHttpUrl rejects credentials", () => {
  assert.throws(() => parsePublicHttpUrl("https://user:pass@example.com/booking"));
});

test("customerBookingUrl prefers the website booker over Radar /book/{slug}", () => {
  const company = {
    websiteBookingUrl: "https://www.stormsprinklers.com/booking",
    bookingSlug: "storm-sprinklers",
    customerBaseUrl: "https://portal.example.com",
  };
  assert.equal(customerBookingUrl(company), "https://www.stormsprinklers.com/booking");
  assert.equal(
    customerRadarBookingUrl(company),
    "https://portal.example.com/book/storm-sprinklers"
  );
});

test("customerBookingUrl falls back to Radar when no website URL is set", () => {
  assert.equal(
    customerBookingUrl({
      bookingSlug: "storm",
      customerBaseUrl: "https://portal.example.com",
    }),
    "https://portal.example.com/book/storm"
  );
});

test("clampOnlineBookingSlotMinutes stays within 15–480", () => {
  assert.equal(clampOnlineBookingSlotMinutes(180), 180);
  assert.equal(clampOnlineBookingSlotMinutes(5), 15);
  assert.equal(clampOnlineBookingSlotMinutes(999), 480);
  assert.equal(clampOnlineBookingSlotMinutes("nope"), 120);
});
