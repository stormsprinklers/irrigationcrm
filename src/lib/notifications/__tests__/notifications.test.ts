import test from "node:test";
import assert from "node:assert/strict";
import { EstimateStatus } from "@prisma/client";
import { formatArrivalWindow } from "../arrival-window";
import { isEstimateOpenForFollowUp } from "../estimate-followup";
import { splitCustomerName } from "../name-utils";
import { renderTemplate } from "../templates";
import { buildNotificationContext, buildEnRouteContext, EN_ROUTE_ETA_FALLBACK } from "../context";

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

test("formatArrivalWindow uses company timezone", () => {
  // 9:00 AM Mountain (MDT, UTC-6) stored as UTC
  const start = new Date("2026-06-24T15:00:00.000Z");
  const window = formatArrivalWindow(start, 3, "America/Denver");
  assert.match(window, /9:00 AM/);
  assert.match(window, /12:00 PM/);
});

test("formatArrivalWindow spans windowHours from start", () => {
  const start = new Date("2026-06-24T15:00:00.000Z");
  const window = formatArrivalWindow(start, 3, "America/Denver");
  assert.match(window, /9:00/);
  assert.match(window, /12:00/);
});

test("buildNotificationContext includes arrival window and parsed names", () => {
  const startAt = new Date("2026-06-24T15:00:00.000Z");
  const ctx = buildNotificationContext({
    company: { name: "Storm Sprinklers", arrivalWindowHours: 3, timezone: "America/Denver" },
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

test("buildEnRouteContext uses fallback when ETA unavailable", () => {
  const ctx = buildEnRouteContext({
    customerName: "Jane Doe",
    companyName: "Storm Sprinklers",
    technicianName: "Mike Tech",
    visitTitle: "Repair",
    timezone: "America/Denver",
  });
  assert.equal(ctx.technician_eta, EN_ROUTE_ETA_FALLBACK);
});
