import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../../app/api/holiday-lighting/quotes/route";
import { signMobileAccessToken } from "../../mobile-auth/tokens";
import { prisma } from "../../prisma";

process.env.AUTH_SECRET = "holiday-quote-list-test-only";
process.env.MOBILE_JWT_SECRET = "holiday-quote-list-mobile-test-only";

function stub(
  t: TestContext,
  model: Record<string, unknown>,
  method: string,
  implementation: (...args: any[]) => any
) {
  const original = model[method];
  const spy = t.mock.fn(implementation);
  model[method] = spy;
  t.after(() => {
    model[method] = original;
  });
  return spy;
}

async function request(query: string) {
  const token = await signMobileAccessToken({
    sub: "staff",
    companyId: "company-a",
    role: "ADMIN",
  });
  return new NextRequest(`https://crm.example.com/api/holiday-lighting/quotes?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

test("holiday quote list paginates and searches customer names or addresses", async (t) => {
  stub(t, prisma.user as unknown as Record<string, unknown>, "findUnique", async () => ({
    id: "staff",
    companyId: "company-a",
    role: "ADMIN",
    status: "ACTIVE",
    name: "Owner",
    email: "owner@example.com",
  }));
  stub(t, prisma.company as unknown as Record<string, unknown>, "findUnique", async () => ({
    name: "Chestnut & Cheer",
    irrigationFeaturesEnabled: false,
    holidayLightingFeaturesEnabled: true,
  }));
  const findMany = stub(
    t,
    prisma.holidayLightingQuote as unknown as Record<string, unknown>,
    "findMany",
    async () => [{
      id: "quote-11",
      customer: { id: "customer-1", name: "Jane Doe" },
      estimate: {
        id: "estimate-1",
        estimateNumber: "EST-101",
        status: "SENT",
        total: 500,
        options: [{ total: 500 }, { total: 2250 }],
      },
    }]
  );
  const count = stub(
    t,
    prisma.holidayLightingQuote as unknown as Record<string, unknown>,
    "count",
    async () => 21
  );

  const response = await GET(await request("search=Jane&page=2&pageSize=10"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.total, 21);
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 10);
  assert.equal(body.quotes[0].customer.name, "Jane Doe");
  assert.deepEqual(body.quotes[0].priceRange, { min: 500, max: 2250 });
  assert.equal(body.quotes[0].estimate.options, undefined);

  const listArgs = findMany.mock.calls[0].arguments[0];
  assert.equal(listArgs.skip, 10);
  assert.equal(listArgs.take, 10);
  assert.deepEqual(listArgs.where, {
    companyId: "company-a",
    AND: [{
      OR: [
        { customer: { is: { name: { contains: "Jane", mode: "insensitive" } } } },
        { address: { contains: "Jane", mode: "insensitive" } },
        { city: { contains: "Jane", mode: "insensitive" } },
        { state: { contains: "Jane", mode: "insensitive" } },
        { zip: { contains: "Jane", mode: "insensitive" } },
        { property: { is: { address: { contains: "Jane", mode: "insensitive" } } } },
        { property: { is: { city: { contains: "Jane", mode: "insensitive" } } } },
        { property: { is: { state: { contains: "Jane", mode: "insensitive" } } } },
        { property: { is: { zip: { contains: "Jane", mode: "insensitive" } } } },
      ],
    }],
  });
  assert.deepEqual(count.mock.calls[0].arguments[0].where, listArgs.where);
});
