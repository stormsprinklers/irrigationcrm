import test from "node:test";
import assert from "node:assert/strict";
import { resolveBookingUrl, resolveCampaignAllowedLinks } from "../campaign-links";

test("resolveBookingUrl prefers campaign override, then website, then Radar slug", () => {
  assert.equal(
    resolveBookingUrl({
      bookingUrlOverride: "https://campaign.example/book",
      websiteBookingUrl: "https://www.stormsprinklers.com/booking",
      bookingSlug: "storm",
      customerBaseUrl: "https://portal.example.com",
    }),
    "https://campaign.example/book"
  );
  assert.equal(
    resolveBookingUrl({
      websiteBookingUrl: "https://www.stormsprinklers.com/booking/",
      bookingSlug: "storm",
      customerBaseUrl: "https://portal.example.com",
    }),
    "https://www.stormsprinklers.com/booking"
  );
  assert.equal(
    resolveBookingUrl({
      bookingSlug: "storm",
      customerBaseUrl: "https://portal.example.com",
    }),
    "https://portal.example.com/book/storm"
  );
});

test("resolveCampaignAllowedLinks includes website winterization as a built-in", () => {
  const links = resolveCampaignAllowedLinks({
    websiteBookingUrl: "https://www.stormsprinklers.com/booking",
    websiteWinterizationBookingUrl: "https://www.stormsprinklers.com/book-winterization",
    bookingSlug: "storm",
    customerBaseUrl: "https://portal.example.com",
  });
  assert.deepEqual(
    links.filter((link) => link.builtin).map((link) => [link.key, link.url]),
    [
      ["booking", "https://www.stormsprinklers.com/booking"],
      ["winterization_booking", "https://www.stormsprinklers.com/book-winterization"],
    ]
  );
});
