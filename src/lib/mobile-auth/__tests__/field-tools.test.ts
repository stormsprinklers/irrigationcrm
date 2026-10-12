import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { decode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { canManagePriceBook, canViewPriceBook } from "../../price-book/permissions";
import { canViewVehicles, canContributeVehicles, canManageVehicles } from "../../vehicles/permissions";
import { createMobileWebSession, MOBILE_WEB_SESSION_SECONDS } from "../web-session";
import { signMobileAccessToken, verifyMobileAccessToken } from "../tokens";
import { prisma } from "../../prisma";
import { resolveMobileCompanyAccount } from "../company-switch";

process.env.AUTH_SECRET = "field-tools-test-secret-only-not-for-production";
process.env.MOBILE_JWT_SECRET = "field-tools-mobile-test-secret-only";

// Prisma model methods are dynamic proxy properties; assign spy functions directly.
function stub(t: TestContext, model: any, method: string, implementation: (...args: any[]) => any) {
  const original = model[method];
  const spy = t.mock.fn(implementation);
  model[method] = spy;
  t.after(() => { model[method] = original; });
  return spy;
}

test("company switching accepts linked accounts and rejects unavailable or customer accounts", async (t) => {
  stub(t, prisma.user, "findUnique", async () => ({ email: "a@example.com" }));
  let target: any = { id: "b", email: "b@example.com", companyId: "company-b", role: "TECH" };
  const lookup = stub(t, prisma.user, "findFirst", async () => target);
  const link = stub(t, prisma.userAccountLink, "findFirst", async () => ({ id: "link" }));
  assert.equal((await resolveMobileCompanyAccount("a", "b"))?.id, "b");
  assert.deepEqual(lookup.mock.calls[0].arguments[0].where, { id: "b", status: "ACTIVE", systemKind: null });
  assert.deepEqual(link.mock.calls[0].arguments[0].where.OR, [
    { userId: "a", linkedUserId: "b" }, { userId: "b", linkedUserId: "a" },
  ]);
  target = null;
  assert.equal(await resolveMobileCompanyAccount("a", "b"), null);
  target = { id: "b", email: "a@example.com", companyId: "company-b", role: "CUSTOMER" };
  assert.equal(await resolveMobileCompanyAccount("a", "b"), null);
});

test("price book is readable by staff but editable only by admins", () => {
  for (const role of ["ADMIN", "MANAGER", "CSR", "SALES", "TECH", "INSTALLER"]) {
    assert.equal(canViewPriceBook(role), true);
    assert.equal(canManagePriceBook(role), role === "ADMIN", role);
  }
  assert.equal(canManagePriceBook(undefined), false);
  assert.equal(canManagePriceBook("admin"), false);
});

test("field staff can contribute to fleet records without administering the fleet", () => {
  for (const role of ["TECH", "INSTALLER", "CSR", "SALES"]) {
    assert.equal(canViewVehicles(role), true);
    assert.equal(canContributeVehicles(role), true);
    assert.equal(canManageVehicles(role), false);
  }
  assert.equal(canManageVehicles("ADMIN"), true);
  assert.equal(canManageVehicles("MANAGER"), true);
  assert.equal(canViewVehicles("CUSTOMER"), false);
});

test("web handoff preserves the selected company and role in an expiring encrypted Auth.js cookie", async () => {
  for (const secure of [true, false]) {
    const payload = await createMobileWebSession({
      id: "technician", email: "tech@example.com", name: "Tech", companyId: "company-b", role: "TECH",
    }, secure);
    assert.equal(payload.cookieName, secure ? "__Secure-authjs.session-token" : "authjs.session-token");
    const claims = await decode({ token: payload.sessionToken, secret: process.env.AUTH_SECRET!, salt: payload.cookieName });
    assert.equal(claims?.id, "technician");
    assert.equal(claims?.companyId, "company-b");
    assert.equal(claims?.role, "TECH");
    assert.equal(claims?.trueRole, undefined);
    assert.equal(payload.expiresIn, MOBILE_WEB_SESSION_SECONDS);
    assert.equal(claims?.exp, claims?.mobileWebExpiresAt);
    await assert.rejects(decode({ token: payload.sessionToken, secret: "wrong-secret", salt: payload.cookieName }));
  }
});

test("native web session endpoint rejects missing and invalid bearer credentials", async () => {
  const { POST } = await import("../../../app/api/mobile/web-session/route");
  for (const headers of [{}, { authorization: "Bearer invalid" }]) {
    const response = await POST(new NextRequest("https://crm.example.com/api/mobile/web-session", { method: "POST", headers }));
    assert.equal(response.status, 401);
  }
});

test("company switch rejects an unrelated account and issues no session", async (t) => {
  const { POST } = await import("../../../app/api/mobile/account/switch/route");
  stub(t, prisma.user, "findUnique", async () => ({ id: "a", email: "a@example.com", name: "A", companyId: "company-a", role: "TECH", status: "ACTIVE" }));
  stub(t, prisma.user, "findFirst", async () => ({ id: "b", email: "b@example.com", name: "B", companyId: "company-b", role: "ADMIN" }));
  stub(t, prisma.userAccountLink, "findFirst", async () => null);
  const create = stub(t, prisma.mobileSession, "create", async () => { throw new Error("must not create a session"); });
  const bearer = await signMobileAccessToken({ sub: "a", companyId: "company-a", role: "TECH" });
  const response = await POST(new NextRequest("https://crm.example.com/api/mobile/account/switch", {
    method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" }, body: JSON.stringify({ userId: "b" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(create.mock.callCount(), 0);
});

test("company switch tokens use the target company and its role, including a lower role", async (t) => {
  const { POST } = await import("../../../app/api/mobile/account/switch/route");
  stub(t, prisma.user, "findUnique", async () => ({ id: "a", email: "owner@example.com", name: "Owner", companyId: "company-a", role: "ADMIN", status: "ACTIVE" }));
  stub(t, prisma.user, "findFirst", async () => ({ id: "b", email: "OWNER@example.com", name: "Owner", companyId: "company-b", role: "TECH" }));
  const create = stub(t, prisma.mobileSession, "create", async () => ({}));
  const bearer = await signMobileAccessToken({ sub: "a", companyId: "company-a", role: "ADMIN" });
  const response = await POST(new NextRequest("https://crm.example.com/api/mobile/account/switch", {
    method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" }, body: JSON.stringify({ userId: "b" }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(await verifyMobileAccessToken(payload.accessToken), { sub: "b", companyId: "company-b", role: "TECH", type: "mobile" });
  assert.equal(create.mock.calls[0].arguments[0].data.companyId, "company-b");
  assert.equal(payload.user.companyId, "company-b");
  assert.equal(canManagePriceBook(payload.user.role), false);
});
