import assert from "node:assert/strict";
import test from "node:test";
import {
  cardOnFileIdempotencyKey,
  classifyCardOnFileError,
} from "./card-on-file";

test("card-on-file retries reuse the invoice balance and amount idempotency key", () => {
  assert.equal(
    cardOnFileIdempotencyKey({ invoiceId: "inv_123", balanceCents: 12500, amountCents: 5000 }),
    "invoice-card-on-file:inv_123:12500:5000"
  );
});

test("card-on-file failures distinguish authentication from a decline", () => {
  assert.deepEqual(
    classifyCardOnFileError({ raw: { code: "authentication_required", payment_intent: { status: "requires_action" } } }),
    { needsCustomer: true, declineCode: null }
  );
  assert.deepEqual(
    classifyCardOnFileError({ code: "card_declined", decline_code: "insufficient_funds" }),
    { needsCustomer: false, declineCode: "insufficient_funds" }
  );
});
