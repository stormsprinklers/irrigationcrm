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

test("attachment signature validation accepts HEIC and rejects a renamed JPEG", async () => {
  const heicHeader = new Uint8Array([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x68, 0x65, 0x69, 0x63,
  ]);
  const heic = new File([heicHeader], "photo.heic", { type: "image/heic" });
  const renamedJpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.heic", {
    type: "image/heic",
  });
  assert.equal(await hasExpectedFileSignature(heic), true);
  assert.equal(await hasExpectedFileSignature(renamedJpeg), false);
});
