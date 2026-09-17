import test from "node:test";
import assert from "node:assert/strict";
import { CampaignChannel } from "@prisma/client";
import { queryAudienceCustomers } from "../audience";

test("an explicitly empty campaign audience selects no customers", async () => {
  const customers = await queryAudienceCustomers("company-id", CampaignChannel.SMS, {
    selectNone: true,
  });
  assert.deepEqual(customers, []);
});
