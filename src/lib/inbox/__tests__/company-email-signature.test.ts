import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCompanyEmailSignature,
  applyCompanyEmailSignatureText,
  buildCompanySignatureHtml,
  buildCompanySignatureText,
  COMPANY_SIGNATURE_ATTR,
  formatCompanySignatureAddress,
} from "../company-email-signature";

const company = {
  companyName: "Storm Sprinklers",
  phone: "(801) 555-0100",
  supportEmail: "hello@stormsprinklers.com",
  website: "https://www.stormsprinklers.com",
  address: "123 Main St",
  city: "Provo",
  state: "UT",
  zip: "84601",
};

test("formatCompanySignatureAddress joins street and city line", () => {
  assert.equal(formatCompanySignatureAddress(company), "123 Main St, Provo, UT 84601");
});

test("buildCompanySignatureText includes name and contact lines", () => {
  const text = buildCompanySignatureText(company);
  assert.match(text, /Storm Sprinklers/);
  assert.match(text, /\(801\) 555-0100/);
  assert.match(text, /hello@stormsprinklers.com/);
  assert.match(text, /www\.stormsprinklers.com/);
  assert.match(text, /123 Main St, Provo, UT 84601/);
});

test("buildCompanySignatureHtml marks the block and links phone/email/website", () => {
  const html = buildCompanySignatureHtml(company);
  assert.match(html, new RegExp(COMPANY_SIGNATURE_ATTR));
  assert.match(html, /tel:8015550100/);
  assert.match(html, /mailto:hello@stormsprinklers.com/);
  assert.match(html, /href="https:\/\/www\.stormsprinklers.com"/);
});

test("applyCompanyEmailSignature appends contact when the body is only a company name", () => {
  const html = applyCompanyEmailSignature("<p>— Storm Sprinklers</p>", company);
  assert.match(html, /hello@stormsprinklers.com/);
  assert.match(html, /\(801\) 555-0100/);
});

test("applyCompanyEmailSignature does not duplicate an existing signature", () => {
  const once = applyCompanyEmailSignature("<p>Hi</p>", company);
  const twice = applyCompanyEmailSignature(once, company);
  assert.equal(twice, once);
});

test("applyCompanyEmailSignature inserts before messaging preferences", () => {
  const html = applyCompanyEmailSignature(
    `<p>Body</p><div style="margin-top:24px"><p><a href="https://example.com">Manage messaging preferences</a></p></div>`,
    company
  );
  const sigAt = html.indexOf(COMPANY_SIGNATURE_ATTR);
  const prefsAt = html.indexOf("Manage messaging preferences");
  assert.ok(sigAt >= 0 && prefsAt > sigAt);
});

test("applyCompanyEmailSignatureText appends contact under the body", () => {
  const text = applyCompanyEmailSignatureText("Thanks,\nStorm Sprinklers", company);
  assert.match(text ?? "", /hello@stormsprinklers.com/);
});
