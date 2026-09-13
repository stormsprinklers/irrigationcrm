import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPostCadence } from "../post-cadence";

describe("getPostCadence", () => {
  const now = new Date("2026-09-13T12:00:00-06:00");

  it("uses the normal tone through four days", () => {
    assert.deepEqual(getPostCadence("2026-09-09T12:00:00-06:00", now), {
      daysSinceLastPost: 4,
      tone: "normal",
    });
  });

  it("uses the warning tone after four days", () => {
    assert.equal(getPostCadence("2026-09-08T12:00:00-06:00", now).tone, "warning");
    assert.equal(getPostCadence("2026-09-06T12:00:00-06:00", now).tone, "warning");
  });

  it("uses the overdue tone after seven days or when there is no valid post", () => {
    assert.equal(getPostCadence("2026-09-05T12:00:00-06:00", now).tone, "overdue");
    assert.equal(getPostCadence(null, now).tone, "overdue");
    assert.equal(getPostCadence("invalid", now).tone, "overdue");
  });
});
