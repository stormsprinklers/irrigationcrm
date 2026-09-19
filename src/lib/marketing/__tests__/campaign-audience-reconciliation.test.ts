import assert from "node:assert/strict";
import test from "node:test";
import { CampaignEnrollmentStatus } from "@prisma/client";
import { planCampaignAudienceReconciliation } from "../campaign-audience-reconciliation";

test("removes only live enrollments that are no longer eligible", () => {
  const result = planCampaignAudienceReconciliation(
    [
      { id: "active-remove", customerId: "one", status: CampaignEnrollmentStatus.ACTIVE, removedByAudience: false },
      { id: "paused-keep", customerId: "two", status: CampaignEnrollmentStatus.PAUSED, removedByAudience: false },
      { id: "completed", customerId: "three", status: CampaignEnrollmentStatus.COMPLETED, removedByAudience: false },
    ],
    ["two"]
  );

  assert.deepEqual(result.removeEnrollmentIds, ["active-remove"]);
  assert.deepEqual(result.restoreEnrollmentIds, []);
  assert.deepEqual(result.addCustomerIds, []);
});

test("adds new customers and only restores cancellations caused by audience editing", () => {
  const result = planCampaignAudienceReconciliation(
    [
      { id: "removed", customerId: "one", status: CampaignEnrollmentStatus.CANCELLED, removedByAudience: true },
      { id: "other-cancel", customerId: "two", status: CampaignEnrollmentStatus.CANCELLED, removedByAudience: false },
      { id: "done", customerId: "three", status: CampaignEnrollmentStatus.COMPLETED, removedByAudience: false },
    ],
    ["one", "two", "three", "four"]
  );

  assert.deepEqual(result.removeEnrollmentIds, []);
  assert.deepEqual(result.restoreEnrollmentIds, ["removed"]);
  assert.deepEqual(result.addCustomerIds, ["four"]);
});
