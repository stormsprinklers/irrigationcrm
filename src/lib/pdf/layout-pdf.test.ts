import test from "node:test";
import assert from "node:assert/strict";
import { SimplePdf, formatCompanyAddress } from "./layout-pdf";

test("company addresses use a clean PDF-safe separator", () => {
  assert.equal(formatCompanyAddress({address:"1372 W Center St",city:"Orem",state:"UT",zip:"84057"}), "1372 W Center St, Orem, UT 84057");
  const pdf = new SimplePdf(); pdf.addMuted("Street · City");
  assert.ok(pdf.toBuffer().includes(Buffer.from("Street , City")));
  assert.ok(!pdf.toBuffer().includes(Buffer.from("Street ? City")));
});
test("PDF terms link has a clickable URI annotation on its page", () => {
  const pdf = new SimplePdf();
  pdf.addLink("Terms and conditions", "https://company.example/terms");
  const text = pdf.toBuffer().toString();
  assert.match(text, /\/Subtype \/Link/);
  assert.match(text, /\/URI \(https:\/\/company.example\/terms\)/);
  assert.match(text, /\/Annots \[\d+ 0 R\]/);
});
