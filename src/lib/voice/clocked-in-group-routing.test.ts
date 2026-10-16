import test from "node:test";
import assert from "node:assert/strict";
import { RingStrategy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveClockedInDialGroup,
  selectClockedInGroupId,
} from "./clocked-in-group-routing";

test("rings the primary group when any primary member is clocked in", () => {
  assert.equal(
    selectClockedInGroupId({
      primaryGroupId: "csr-day",
      fallbackGroupId: "manager-backup",
      primaryHasClockedInMember: true,
    }),
    "csr-day"
  );
});

test("rings the fallback group when nobody in the primary group is clocked in", () => {
  assert.equal(
    selectClockedInGroupId({
      primaryGroupId: "csr-day",
      fallbackGroupId: "manager-backup",
      primaryHasClockedInMember: false,
    }),
    "manager-backup"
  );
});

test("keeps the primary group when no fallback is configured", () => {
  assert.equal(
    selectClockedInGroupId({
      primaryGroupId: "csr-day",
      primaryHasClockedInMember: false,
    }),
    "csr-day"
  );
});

test("resolves primary and fallback teams from live time-clock entries", async (t) => {
  const now = new Date();
  const primary = {
    id: "csr-day",
    companyId: "company-1",
    name: "Day CSRs",
    ringStrategy: RingStrategy.SIMULTANEOUS,
    ringTimeoutSec: 30,
    createdAt: now,
    updatedAt: now,
    members: [{ userId: "riley" }],
  };
  const fallback = {
    ...primary,
    id: "manager-backup",
    name: "Manager backup",
    members: [{ userId: "manager" }],
  };
  const originalGroupFindFirst = prisma.agentGroup.findFirst;
  const originalClockFindFirst = prisma.timeClockEntry.findFirst;
  const originalInfo = console.info;
  let hasClockedInEntry = false;

  prisma.agentGroup.findFirst = (async (args: { where?: { id?: string } }) =>
    args.where?.id === fallback.id ? fallback : primary) as unknown as typeof prisma.agentGroup.findFirst;
  prisma.timeClockEntry.findFirst = (async () =>
    hasClockedInEntry ? { id: "open-clock" } : null) as unknown as typeof prisma.timeClockEntry.findFirst;
  console.info = () => {};
  t.after(() => {
    prisma.agentGroup.findFirst = originalGroupFindFirst;
    prisma.timeClockEntry.findFirst = originalClockFindFirst;
    console.info = originalInfo;
  });

  const config = {
    groupId: primary.id,
    clockedInFallbackGroupId: fallback.id,
  };
  const whenNobodyClockedIn = await resolveClockedInDialGroup("company-1", config);
  assert.equal(whenNobodyClockedIn?.id, fallback.id);

  hasClockedInEntry = true;
  const whenPrimaryIsClockedIn = await resolveClockedInDialGroup("company-1", config);
  assert.equal(whenPrimaryIsClockedIn?.id, primary.id);
});
