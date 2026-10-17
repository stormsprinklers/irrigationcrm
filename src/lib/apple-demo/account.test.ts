import assert from "node:assert/strict";
import test from "node:test";

test("review account creates a separate tenant with only synthetic records and no account links", async () => {
  const calls: { model: string; args: any }[] = [];
  const record = (model: string, result: any) => ({ create: async (args: any) => { calls.push({model,args}); return result; } });
  const tx = {
    company: record("company", {id:"isolated-review-tenant"}),
    user: record("user", {id:"reviewer", companyId:"isolated-review-tenant"}),
    customer: record("customer", {id:"sample-customer"}),
    customerProperty: record("property", {id:"sample-property",address:"100 Example Lane",city:"Demo City",state:"UT",zip:"84000"}),
    visit: record("visit", {}), priceBookCategory: record("prices", {}),
  };
  (globalThis as any).prisma = {
    user: { findFirst: async (args: any) => { calls.push({model:"lookup",args}); return null; } },
    $transaction: async (fn: any) => fn(tx),
  };
  const {createAppleDemoAccount} = await import("./account");
  const result = await createAppleDemoAccount("real-company");
  assert.ok(typeof result.plainPassword === "string" && result.plainPassword.length >=14);
  const data = (model: string) => calls.find(c=>c.model===model)!.args.data;
  assert.equal(data("company").bookingSlug, "apple-review-real-company");
  assert.equal(data("company").onlineBookingEnabled,false);
  assert.equal(data("company").twilioPhone,undefined);
  assert.equal(data("user").companyId,"isolated-review-tenant");
  assert.equal(data("user").role,"TECH");
  assert.equal(data("user").phone,null);
  assert.equal(data("user").linkedAccounts,undefined);
  for (const model of ["customer","property","visit","prices"]) assert.equal(data(model).companyId,"isolated-review-tenant");
  assert.equal(data("customer").email,undefined);
  assert.equal(data("customer").phone,undefined);
  assert.equal(data("visit").assignedUserId,"reviewer");
  assert.deepEqual(calls[0].args.where.company,{bookingSlug:"apple-review-real-company"});
});
