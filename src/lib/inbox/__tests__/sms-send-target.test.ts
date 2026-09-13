import test from "node:test";
import assert from "node:assert/strict";
import { resolveSmsSendTarget } from "../sms-send-target";

test("open thread ignores a leftover compose recipient from a lead", () => {
  const target = resolveSmsSendTarget({
    conversationId: "bob-thread",
    conversation: {
      id: "bob-thread",
      participantPhone: "+18015550002",
      title: "Bob",
      customer: { id: "bob-customer" },
    },
    recipient: {
      phone: "+18015550001",
      name: "Alice",
    },
    initialCustomerId: "alice-customer",
  });

  assert.deepEqual(target, {
    ok: true,
    to: "+18015550002",
    conversationId: "bob-thread",
    customerId: "bob-customer",
    title: "Bob",
  });
});

test("does not mix the open thread's customer with a stale compose phone", () => {
  const target = resolveSmsSendTarget({
    conversationId: "bob-thread",
    conversation: {
      id: "bob-thread",
      participantPhone: "+18015550002",
      customer: { id: "bob-customer" },
    },
    recipient: { phone: "+18015550001", name: "Alice" },
  });

  assert.equal(target.ok, true);
  if (!target.ok) return;
  assert.equal(target.to, "+18015550002");
  assert.equal(target.customerId, "bob-customer");
});

test("blocks send until the selected conversation has loaded", () => {
  const stillOnPreviousThread = resolveSmsSendTarget({
    conversationId: "bob-thread",
    conversation: {
      id: "alice-thread",
      participantPhone: "+18015550001",
      customer: { id: "alice-customer" },
    },
    recipient: { phone: "+18015550001", name: "Alice" },
  });
  assert.deepEqual(stillOnPreviousThread, {
    ok: false,
    error: "Conversation is still loading",
  });

  const clearedWhileLoading = resolveSmsSendTarget({
    conversationId: "bob-thread",
    conversation: null,
    recipient: { phone: "+18015550001", name: "Alice" },
  });
  assert.deepEqual(clearedWhileLoading, {
    ok: false,
    error: "Conversation is still loading",
  });
});

test("compose uses the picker recipient, not a previous thread", () => {
  const target = resolveSmsSendTarget({
    conversationId: null,
    conversation: {
      id: "bob-thread",
      participantPhone: "+18015550002",
      customer: { id: "bob-customer" },
    },
    recipient: {
      phone: "+18015550001",
      name: "Alice",
      customerId: "alice-customer",
    },
  });

  assert.deepEqual(target, {
    ok: true,
    to: "+18015550001",
    customerId: "alice-customer",
    title: "Alice",
    userId: undefined,
  });
});
