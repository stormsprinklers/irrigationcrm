import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../../prisma";
import { signMobileAccessToken } from "../tokens";
import { POST } from "../../../app/api/estimates/[id]/employee-approval/route";
process.env.AUTH_SECRET = "employee-approval-test";
process.env.MOBILE_JWT_SECRET = "employee-approval-mobile-test";
function stub(t: TestContext, model: any, method: string, fn: (...args: any[]) => any) {
  const before = model[method]; const spy = t.mock.fn(fn); model[method] = spy; t.after(() => { model[method] = before; }); return spy;
}
const user = { id: "tech", name: "Test Employee", email: "tech@example.com", role: "TECH", companyId: "company-a", status: "ACTIVE" };
async function request(body: object) {
  const token = await signMobileAccessToken({ sub: user.id, role: user.role, companyId: user.companyId });
  return new NextRequest("https://crm.example.com/api/estimates/estimate/employee-approval", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}
function estimate() { return { id: "estimate", companyId: "company-a", customerId: "customer", visitId: "visit", status: "DRAFT", signatureBlobUrl: null, signedAt: null, updatedAt: new Date("2026-10-15T12:00:00Z"), options: [{ id: "option", subtotal: 100, discountTotal: 0, total: 100 }], lineItems: [{ optionId: "option" }], designExportMetadata: { source: "holiday-lighting" } }; }

test("employee approval requires explicit confirmation and a company-owned estimate/option", async t => {
  stub(t, prisma.user, "findUnique", async () => user);
  let record: any = estimate();
  const find = stub(t, prisma.estimate, "findFirst", async () => record);
  const transaction = stub(t, prisma, "$transaction", async () => { throw new Error("No writes allowed"); });
  const params = { params: Promise.resolve({ id: "estimate" }) };
  assert.equal((await POST(await request({}), params)).status, 400);
  assert.equal((await POST(await request({ confirmEmployeeApproval: true, selectedOptionId: "foreign-option" }), params)).status, 400);
  record.status = "APPROVED";
  assert.equal((await POST(await request({ confirmEmployeeApproval: true }), params)).status, 400);
  record = null;
  assert.equal((await POST(await request({ confirmEmployeeApproval: true }), params)).status, 404);
  assert.deepEqual(find.mock.calls.at(-1)?.arguments[0].where, { id: "estimate", companyId: "company-a" });
  assert.equal(transaction.mock.callCount(), 0);
});

test("employee approval records actor, selected price, audit and note without signature or send", async t => {
  stub(t, prisma.user, "findUnique", async () => user);
  let count = 0;
  const record = estimate();
  stub(t, prisma.estimate, "findFirst", async () => ++count === 1 ? record : null);
  const update = t.mock.fn(async (_args: any) => ({}));
  const audit = t.mock.fn(async (_args: any) => ({}));
  const note = t.mock.fn(async (_args: any) => ({}));
  stub(t, prisma, "$transaction", async fn => fn({ estimate: { update }, estimateOption: { updateMany: async () => ({}) }, staffAuditLog: { create: audit }, estimateNote: { create: note } }));
  stub(t, prisma.notificationJob, "updateMany", async () => ({ count: 0 }));
  const response = await POST(await request({ confirmEmployeeApproval: true, selectedOptionId: "option" }), { params: Promise.resolve({ id: "estimate" }) });
  assert.equal(response.status, 200);
  const data = update.mock.calls[0].arguments[0].data;
  assert.equal(data.status, "APPROVED"); assert.equal(data.total, 100);
  assert.equal(data.designExportMetadata.employeeApproval.employeeId, "tech");
  assert.equal(data.designExportMetadata.source, "holiday-lighting");
  assert.equal(data.signatureBlobUrl, undefined); assert.equal(data.signedAt, undefined); assert.equal(data.sentAt, undefined);
  assert.equal(audit.mock.calls[0].arguments[0].data.action, "EMPLOYEE_APPROVAL");
  assert.match(note.mock.calls[0].arguments[0].data.body, /without a customer signature/);
});
