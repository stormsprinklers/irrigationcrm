import test from "node:test";
import assert from "node:assert/strict";
import { authorizeCronRequest } from "./trusted-request";

test("cron authorization fails closed when the secret is absent", () => {
  const before = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const response = authorizeCronRequest(new Request("https://crm.test/api/cron/jobs"));
    assert.equal(response?.status, 503);
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
});

test("cron authorization requires an exact bearer token", () => {
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    assert.equal(
      authorizeCronRequest(
        new Request("https://crm.test/api/cron/jobs", {
          headers: { authorization: "Bearer wrong" },
        })
      )?.status,
      401
    );
    assert.equal(
      authorizeCronRequest(
        new Request("https://crm.test/api/cron/jobs", {
          headers: { authorization: "Bearer test-secret" },
        })
      ),
      null
    );
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
});
