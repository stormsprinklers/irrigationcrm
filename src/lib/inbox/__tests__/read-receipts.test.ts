import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSmsReadReceipt,
  formatSmsReadReceiptDetails,
  type SmsReadReceipt,
} from "../read-receipts";

function receipts(...names: string[]): SmsReadReceipt[] {
  return names.map((name, index) => ({
    readAt: `2026-11-16T12:0${index}:00.000Z`,
    user: { id: `user-${index}`, name },
  }));
}

test("attributes one or two SMS readers by employee name", () => {
  assert.equal(formatSmsReadReceipt(receipts("Alex")), "Seen by Alex");
  assert.equal(formatSmsReadReceipt(receipts("Alex", "Jordan")), "Seen by Alex and Jordan");
});

test("summarizes more than two SMS readers by count", () => {
  assert.equal(formatSmsReadReceipt(receipts("Alex", "Jordan", "Taylor")), "Seen by 3");
});

test("hides the receipt label until an employee has opened the thread", () => {
  assert.equal(formatSmsReadReceipt([]), null);
});

test("identifies employees who have and have not seen the inbound SMS", () => {
  assert.equal(
    formatSmsReadReceiptDetails(receipts("Alex", "Jordan"), [
      { id: "user-0", name: "Alex" },
      { id: "user-1", name: "Jordan" },
      { id: "user-2", name: "Taylor" },
    ]),
    "Seen: Alex, Jordan\nNot seen: Taylor"
  );
});
