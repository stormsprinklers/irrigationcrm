import test from "node:test";
import assert from "node:assert/strict";
import { EstimateStatus } from "@prisma/client";
import { formatArrivalWindow } from "../arrival-window";
import { isEstimateOpenForFollowUp } from "../estimate-followup";
import { splitCustomerName } from "../name-utils";
import { renderTemplate } from "../templates";
import { buildNotificationContext } from "../context";

test("isEstimateOpenForFollowUp is true only for SENT", () => {
  assert.equal(isEstimateOpenForFollowUp(EstimateStatus.SENT), true);
  assert.equal(isEstimateOpenForFollowUp(EstimateStatus.APPROVED), false);
  assert.equal(isEstimateOpenForFollowUp(EstimateStatus.DECLINED), false);
});

test("renderTemplate supports snake_case merge fields", () => {
  const out = renderTemplate("Hi {customer_first_name} from {company_name}", {
    customer_first_name: "Jane",
    company_name: "Storm Sprinklers",
  });
  assert.equal(out, "Hi Jane from Storm Sprinklers");
});

test("renderTemplate supports legacy camelCase merge fields", () => {
  const out = renderTemplate("Hi {{customerName}}", { customerName: "Bob" });
  assert.equal(out, "Hi Bob");
});

test("splitCustomerName parses first and last name", () => {
  assert.deepEqual(splitCustomerName("Jane Doe"), { firstName: "Jane", lastName: "Doe" });
  assert.deepEqual(splitCustomerName("Madonna"), { firstName: "Madonna", lastName: "" });
});

test("formatArrivalWindow spans windowHours from start", () => {
  const start = new Date("2026-06-23T13:00:00");
  const window = formatArrivalWindow(start, 3);
  assert.match(window, /1:00/);
  assert.match(window, /4:00/);
});

test("buildNotificationContext includes arrival window and parsed names", () => {
  const startAt = new Date("2026-06-23T13:00:00");
  const ctx = buildNotificationContext({
    company: { name: "Storm Sprinklers", arrivalWindowHours: 3 },
    customer: { name: "Jane Doe", address: "123 Main St" },
    visit: { title: "Spring start-up", startAt, address: "123 Main St" },
    technician: { name: "Mike Tech" },
  });
  assert.equal(ctx.customer_first_name, "Jane");
  assert.equal(ctx.customer_last_name, "Doe");
  assert.equal(ctx.technician_first_name, "Mike");
  assert.equal(ctx.company_name, "Storm Sprinklers");
  assert.ok(String(ctx.visit_arrival_window).includes("–"));
});
