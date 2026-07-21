import test from "node:test";
import assert from "node:assert/strict";
import {
  addressParityFromAddress,
  parseStreetNumber,
} from "../runtime-engine/restrictions/address-parity";
import {
  lookupCityWateringRule,
  pickDaysFromAssigned,
  resolveCityAddressSchedule,
} from "../runtime-engine/restrictions/city-watering-rules";
import { buildControllerGuide } from "../runtime-engine/programs/build-controller-guide";
import type { ZoneRuntimeInput } from "../runtime-engine/types";

function grassZone(id = "z1"): ZoneRuntimeInput {
  return {
    id,
    name: "Front lawn",
    sortOrder: 0,
    vegetationType: "grass",
    shadeLevel: "full_sun",
    slopeLevel: "flat",
    soilType: "loam",
    irrigationType: "rotary",
    nozzleCount: 6,
    estimatedGpm: 2.88,
    irrigatedSqFt: 800,
    irrigationEfficiencyScore: 7,
    establishmentStage: "NORMAL",
    nozzleGpm: null,
  };
}

test("parseStreetNumber reads leading digits", () => {
  assert.equal(parseStreetNumber("123 Main St"), 123);
  assert.equal(parseStreetNumber("  456A Oak Ave"), 456);
  assert.equal(parseStreetNumber("Main St"), null);
  assert.equal(parseStreetNumber(null), null);
});

test("addressParityFromAddress uses last digit parity via street number", () => {
  assert.equal(addressParityFromAddress("123 Main St"), "odd");
  assert.equal(addressParityFromAddress("128 Main St"), "even");
  assert.equal(addressParityFromAddress("PO Box"), null);
});

test("lookupCityWateringRule normalizes city names", () => {
  assert.equal(lookupCityWateringRule("alpine")?.city, "Alpine");
  assert.equal(lookupCityWateringRule("Eagle Mountain City")?.city, "Eagle Mountain");
  assert.equal(lookupCityWateringRule("Lehi"), null);
});

test("Alpine odd/even weekday schedules and Sunday ban", () => {
  const odd = resolveCityAddressSchedule({
    city: "Alpine",
    address: "101 Canyon Rd",
  });
  assert.ok(odd);
  assert.equal(odd.parity, "odd");
  assert.deepEqual(odd.daysOfWeek, ["MON", "WED", "FRI"]);
  assert.equal(odd.sundayPolicy, "prohibited");

  const even = resolveCityAddressSchedule({
    city: "Alpine",
    address: "102 Canyon Rd",
  });
  assert.ok(even);
  assert.deepEqual(even.daysOfWeek, ["TUE", "THU", "SAT"]);
});

test("Highland flips Alpine's odd/even weekday sets", () => {
  const odd = resolveCityAddressSchedule({
    city: "Highland",
    address: "55 Alpine Hwy",
  });
  assert.deepEqual(odd?.daysOfWeek, ["TUE", "THU", "SAT"]);

  const even = resolveCityAddressSchedule({
    city: "Highland",
    address: "56 Alpine Hwy",
  });
  assert.deepEqual(even?.daysOfWeek, ["MON", "WED", "FRI"]);
});

test("Pleasant Grove remaps Sunday to Saturday for even addresses", () => {
  const even = resolveCityAddressSchedule({
    city: "Pleasant Grove",
    address: "200 Center St",
  });
  assert.ok(even);
  assert.equal(even.sundayPolicy, "saturday_only");
  assert.deepEqual(even.daysOfWeek, ["TUE", "THU", "SAT"]);
  assert.ok(!even.daysOfWeek.includes("SUN"));
});

test("American Fork keeps Sunday for even addresses with limited policy", () => {
  const even = resolveCityAddressSchedule({
    city: "American Fork",
    address: "88 State St",
  });
  assert.ok(even);
  assert.equal(even.sundayPolicy, "limited");
  assert.deepEqual(even.daysOfWeek, ["SUN", "TUE", "THU"]);
});

test("Eagle Mountain and Mapleton use calendar-date parity", () => {
  const eagleOdd = resolveCityAddressSchedule({
    city: "Eagle Mountain",
    address: "11 Pony Express",
  });
  assert.equal(eagleOdd?.mode, "odd_calendar_dates");
  assert.deepEqual(eagleOdd?.daysOfWeek, []);

  const mapletonEven = resolveCityAddressSchedule({
    city: "Mapleton",
    address: "22 Maple Dr",
  });
  assert.equal(mapletonEven?.mode, "even_calendar_dates");
});

test("pickDaysFromAssigned supports drought 2-of-3 recommendation", () => {
  assert.deepEqual(pickDaysFromAssigned(["MON", "WED", "FRI"], 2), ["MON", "WED"]);
  assert.deepEqual(pickDaysFromAssigned(["SUN", "TUE", "THU"], 2), ["SUN", "TUE"]);
});

test("buildControllerGuide applies Alpine odd-address days", () => {
  const guide = buildControllerGuide({
    propertyId: "prop-alpine",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: false,
      cycleSoakEnabled: false,
    },
    zones: [grassZone()],
    weather: { weeklyEToInches: 1.8, totalRainfallInches: 0.3, source: "open_meteo" },
    location: { city: "Alpine", address: "101 Canyon Rd" },
  });

  assert.ok(guide.addressRestriction);
  assert.equal(guide.addressRestriction?.city, "Alpine");
  assert.equal(guide.addressRestriction?.parity, "odd");
  assert.deepEqual(guide.programs[0].daysOfWeek, ["MON", "WED", "FRI"]);
  assert.match(guide.programs[0].daysLabel, /Mon \/ Wed \/ Fri/);
  assert.ok(guide.notes.some((note) => /Alpine odd-address/i.test(note)));
  assert.ok(guide.notes.some((note) => /7 PM/i.test(note)));
});

test("buildControllerGuide drought mode uses 2 of city-assigned days", () => {
  const guide = buildControllerGuide({
    propertyId: "prop-af",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: true,
      cycleSoakEnabled: false,
    },
    zones: [grassZone()],
    weather: { weeklyEToInches: 1.8, totalRainfallInches: 0.3, source: "open_meteo" },
    location: { city: "American Fork", address: "101 Main St" },
  });

  // Odd American Fork = Mon/Wed/Fri; drought picks first 2.
  assert.deepEqual(guide.programs[0].daysOfWeek, ["MON", "WED"]);
  assert.ok(
    guide.notes.some((note) => /2 of the 3 assigned days/i.test(note))
  );
});

test("buildControllerGuide uses even calendar dates for Mapleton", () => {
  const guide = buildControllerGuide({
    propertyId: "prop-map",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: false,
      cycleSoakEnabled: false,
    },
    zones: [grassZone()],
    weather: { weeklyEToInches: 1.8, totalRainfallInches: 0.3, source: "open_meteo" },
    location: { city: "Mapleton", address: "40 Maple Dr" },
  });

  assert.equal(guide.programs[0].scheduleMode, "even_calendar_dates");
  assert.equal(guide.programs[0].daysLabel, "Even calendar dates");
  assert.ok(guide.notes.some((note) => /10 AM–6 PM/i.test(note)));
});

test("buildControllerGuide warns when restricted city lacks street number", () => {
  const guide = buildControllerGuide({
    propertyId: "prop-payson",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: true,
      cycleSoakEnabled: false,
    },
    zones: [grassZone()],
    weather: { weeklyEToInches: 1.8, totalRainfallInches: 0.3, source: "open_meteo" },
    location: { city: "Payson", address: "Main Street" },
  });

  assert.equal(guide.addressRestriction, null);
  assert.ok(guide.notes.some((note) => /street number could not be read/i.test(note)));
  // Falls back to drought Tue/Fri when parity cannot be resolved.
  assert.deepEqual(guide.programs[0].daysOfWeek, ["TUE", "FRI"]);
});

test("establishment still overrides city parity day limits", () => {
  const guide = buildControllerGuide({
    propertyId: "prop-est",
    settings: {
      grassSeason: "COOL",
      droughtRestrictionsActive: true,
      cycleSoakEnabled: false,
    },
    zones: [
      {
        ...grassZone(),
        establishmentStage: "NEW_SOD",
      },
    ],
    weather: { weeklyEToInches: 1.8, totalRainfallInches: 0, source: "open_meteo" },
    location: { city: "Alpine", address: "101 Canyon Rd" },
  });

  assert.equal(guide.programs[0].isEstablishment, true);
  assert.equal(guide.programs[0].daysOfWeek.length, 7);
  assert.ok(guide.addressRestriction);
});
