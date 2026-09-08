import test from "node:test";
import assert from "node:assert/strict";
import { renderMarketingMergeFields } from "../render-merge";

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
    bodyHtml: "<p>Hi {customer_first_name} at {customer_address}</p>",
  });

  assert.equal(out.subject, "Hi Jane from Chestnut & Cheer");
  assert.equal(out.bodyText, "Call 385-999-6887. Book: https://utah.christmas/book/cc");
  assert.equal(out.bodyHtml, "<p>Hi Jane at 10 Main St, Lehi, UT 84043</p>");
});
