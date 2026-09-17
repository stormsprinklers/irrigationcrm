import test from "node:test";
import assert from "node:assert/strict";
import { renderMarketingMergeFields } from "../render-merge";
import { marketingProperCase } from "../proper-case";

test("renderMarketingMergeFields personalizes subject, SMS, and HTML", () => {
  const out = renderMarketingMergeFields({
    company: {
      name: "Chestnut & Cheer",
      phone: "385-999-6887",
      bookingSlug: "cc",
      customerBaseUrl: "https://utah.christmas",
    },
    customer: {
      name: "Jane Doe",
      address: "10 Main St",
      city: "Lehi",
      state: "UT",
      zip: "84043",
    },
    subject: "Hi {customer_first_name} from {company_name}",
    bodyText: "Call {company_phone}. Book: {booking_link}",
    bodyHtml: "<p>Hi {customer_first_name} in {customer_city} at {customer_address}</p>",
  });

  assert.equal(out.subject, "Hi Jane from Chestnut & Cheer");
  assert.equal(out.bodyText, "Call 385-999-6887. Book: https://utah.christmas/book/cc");
  assert.equal(out.bodyHtml, "<p>Hi Jane in Lehi at 10 Main St, Lehi, UT 84043</p>");
});

test("renderMarketingMergeFields uses the website booking URL when set", () => {
  const out = renderMarketingMergeFields({
    company: {
      name: "Storm Sprinklers",
      bookingSlug: "storm-sprinklers",
      customerBaseUrl: "https://portal.example.com",
      websiteBookingUrl: "https://www.stormsprinklers.com/booking",
    },
    customer: { name: "Jane Doe" },
    subject: "Book",
    bodyText: "Book: {booking_link}",
    bodyHtml: null,
  });
  assert.equal(out.bodyText, "Book: https://www.stormsprinklers.com/booking");
});

test("renderMarketingMergeFields uses per-token fallbacks when customer fields are empty", () => {
  const out = renderMarketingMergeFields({
    company: { name: "Storm Sprinklers" },
    customer: { name: "", address: "" },
    subject: "Hi {customer_first_name|there}",
    bodyText: "See you at {customer_address|your home}.",
    bodyHtml:
      '<p><span data-merge-token="customer_first_name">{customer_first_name|friend}</span></p>',
  });

  assert.equal(out.subject, "Hi there");
  assert.equal(out.bodyText, "See you at your home.");
  assert.equal(out.bodyHtml, "<p>friend</p>");
});

test("renderMarketingMergeFields fills {customer_city} from the property when the customer city is empty", () => {
  const out = renderMarketingMergeFields({
    company: { name: "Storm Sprinklers" },
    customer: { name: "Jane Doe", city: "" },
    property: { city: "Draper" },
    subject: "Neighbors in {customer_city}",
    bodyText: "We're in {customer_city|your area} this week.",
    bodyHtml: null,
  });

  assert.equal(out.subject, "Neighbors in Draper");
  assert.equal(out.bodyText, "We're in Draper this week.");
});

test("campaign merge fields use readable names and places without changing authored copy", () => {
  const out = renderMarketingMergeFields({
    company: { name: "STORM Sprinklers" },
    customer: {
      name: "LISA O'NEIL",
      address: "123 MAIN ST",
      city: "SALT LAKE CITY",
      state: "ut",
      zip: "84101",
    },
    subject: "Hello {customer_first_name} {customer_last_name} from {company_name}",
    bodyText: "Hi {customer_first_name} {customer_last_name}, we're coming to {customer_city}.",
    bodyHtml: "<p>{customer_address}</p>",
  });

  assert.equal(out.subject, "Hello Lisa O'Neil from STORM Sprinklers");
  assert.equal(out.bodyText, "Hi Lisa O'Neil, we're coming to Salt Lake City.");
  assert.equal(out.bodyHtml, "<p>123 Main St, Salt Lake City, UT 84101</p>");
});

test("campaign merge fields format property addresses when used for a customer", () => {
  const out = renderMarketingMergeFields({
    company: { name: "Storm Sprinklers" },
    customer: { name: "MARY-JANE DOE" },
    property: {
      address: "456 WEST CENTER ST",
      city: "WEST JORDAN",
      state: "UT",
      zip: "84084",
    },
    subject: "Hi {customer_first_name}",
    bodyText: "Your home: {customer_address}",
    bodyHtml: null,
  });

  assert.equal(out.subject, "Hi Mary-Jane");
  assert.equal(out.bodyText, "Your home: 456 West Center St, West Jordan, UT 84084");
});

test("marketingProperCase handles apostrophes and mixed capitalization", () => {
  assert.equal(marketingProperCase("D'ANGELO'S PLACE"), "D'Angelo's Place");
  assert.equal(marketingProperCase("sAlT lAkE cItY"), "Salt Lake City");
  assert.equal(marketingProperCase("  "), null);
});
