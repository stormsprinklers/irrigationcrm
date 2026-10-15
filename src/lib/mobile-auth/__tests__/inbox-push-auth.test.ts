import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../../prisma";
import { getSessionUser } from "../../api-auth";
import { signMobileAccessToken } from "../tokens";
import { POST as voiceToken } from "../../../app/api/inbox/voice/token/route";
import { GET as pushStatus, POST as pushTest } from "../../../app/api/mobile/push/status/route";

process.env.AUTH_SECRET = "inbox-push-test-secret";
process.env.MOBILE_JWT_SECRET = "inbox-push-mobile-test-secret";
const current = { id: "a", email: "owner@example.com", name: "Owner", companyId: "storm", role: "ADMIN", status: "ACTIVE", company: { id: "storm", name: "Storm", brandLogoUrl: null, emailLogoUrl: null } };
function stub(t: TestContext, model: any, method: string, implementation: (...args: any[]) => any) {
  const original = model[method]; const spy = t.mock.fn(implementation); model[method] = spy;
  t.after(() => { model[method] = original; }); return spy;
}
async function request(path: string, method = "GET", body?: object) {
  const token = await signMobileAccessToken({ sub: "a", companyId: "storm", role: "ADMIN" });
  return new NextRequest(`https://crm.example.com${path}`, { method, headers: { authorization: `Bearer ${token}`, cookie: "__Secure-authjs.session-token=stale-other-company-cookie", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test("native bearer identity wins over a stale embedded web cookie", async t => {
  stub(t, prisma.user, "findUnique", async () => current);
  assert.equal((await getSessionUser(await request("/api/account/companies")))?.companyId, "storm");
  const invalid = new NextRequest("https://crm.example.com/api/account/companies", { headers: { authorization: "Bearer expired", cookie: "__Secure-authjs.session-token=other-company" } });
  assert.equal(await getSessionUser(invalid), null);
});

test("expired phone authentication returns 401 so iOS can refresh", async () => {
  const response = await voiceToken(new NextRequest("https://crm.example.com/api/inbox/voice/token?platform=ios", { method: "POST", headers: { authorization: "Bearer expired" } }));
  assert.equal(response.status, 401);
});

test("notification status and tests are scoped to the authenticated company and device owner", async t => {
  stub(t, prisma.user, "findUnique", async () => current);
  const count = stub(t, prisma.mobilePushDevice, "count", async () => 1);
  const status = await pushStatus(await request("/api/mobile/push/status"));
  assert.equal(status.status, 200);
  assert.equal((await status.json()).registeredDevices, 1);
  assert.deepEqual(count.mock.calls[0].arguments[0].where, { userId: "a", companyId: "storm", platform: "ios" });
  const saved = [process.env.APNS_KEY_ID, process.env.APNS_TEAM_ID, process.env.APNS_PRIVATE_KEY];
  process.env.APNS_KEY_ID = "test"; process.env.APNS_TEAM_ID = "test"; process.env.APNS_PRIVATE_KEY = "test";
  try {
    const lookup = stub(t, prisma.mobilePushDevice, "findFirst", async () => null);
    const response = await pushTest(await request("/api/mobile/push/status", "POST", { deviceToken: "someone-elses-token" }));
    assert.equal(response.status, 404);
    assert.deepEqual(lookup.mock.calls[0].arguments[0].where, { userId: "a", companyId: "storm", platform: "ios", deviceToken: "someone-elses-token" });
  } finally {
    ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY"].forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
});
