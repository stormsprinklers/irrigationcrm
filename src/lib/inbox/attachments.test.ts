import test from "node:test";
import assert from "node:assert/strict";
import { hasExpectedFileSignature } from "./attachments";

test("attachment signature validation rejects MIME spoofing", async () => {
  const spoofed = new File(["<script>alert(1)</script>"], "photo.jpg", { type: "image/jpeg" });
  assert.equal(await hasExpectedFileSignature(spoofed), false);
});

test("attachment signature validation accepts a PDF header", async () => {
  const pdf = new File(["%PDF-1.7\n"], "invoice.pdf", { type: "application/pdf" });
  assert.equal(await hasExpectedFileSignature(pdf), true);
});
