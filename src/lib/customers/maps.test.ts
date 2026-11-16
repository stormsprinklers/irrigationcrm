import assert from "node:assert/strict";
import test from "node:test";
import {
  addressNeedsGoogleNormalization,
  parseGoogleGeocodeResult,
} from "@/lib/customers/maps";

test("recognizes a legacy combined address as needing Google normalization", () => {
  assert.equal(
    addressNeedsGoogleNormalization({
      address: "1046 W Seasons View CT, Lehi UT. 84043",
      city: null,
      state: null,
      zip: null,
    }),
    true
  );
});

test("does not send complete or unqualified street-only addresses to Google", () => {
  assert.equal(
    addressNeedsGoogleNormalization({
      address: "1046 W Seasons View Ct",
      city: "Lehi",
      state: "UT",
      zip: "84043",
    }),
    false
  );
  assert.equal(
    addressNeedsGoogleNormalization({ address: "1046 W Seasons View Ct" }),
    false
  );
});

test("parses Google geocoding components into structured CRM address fields", () => {
  assert.deepEqual(
    parseGoogleGeocodeResult(
      {
        formatted_address: "1046 W Seasons View Ct, Lehi, UT 84043, USA",
        geometry: { location: { lat: 40.4, lng: -111.8 } },
        address_components: [
          { long_name: "1046", short_name: "1046", types: ["street_number"] },
          { long_name: "West Seasons View Court", short_name: "W Seasons View Ct", types: ["route"] },
          { long_name: "Lehi", short_name: "Lehi", types: ["locality"] },
          { long_name: "Utah", short_name: "UT", types: ["administrative_area_level_1"] },
          { long_name: "84043", short_name: "84043", types: ["postal_code"] },
        ],
      },
      "1046 W Seasons View CT, Lehi UT. 84043"
    ),
    {
      lat: 40.4,
      lng: -111.8,
      formattedAddress: "1046 W Seasons View Ct, Lehi, UT 84043, USA",
      address: "1046 West Seasons View Court",
      city: "Lehi",
      state: "UT",
      zip: "84043",
      partialMatch: false,
    }
  );
});
