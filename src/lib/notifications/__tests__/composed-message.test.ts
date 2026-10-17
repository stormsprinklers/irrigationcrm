import test from "node:test";
import assert from "node:assert/strict";
import { composeEstimateMessage, escapeMessageHtml } from "../composed-message";

test("editable estimate copy retains the server supplied estimate link", () => {
  const link = "https://example.com/portal/estimate/server-token";
  assert.equal(composeEstimateMessage("  Here is your revised quote.  ", link), `Here is your revised quote.\n\n${link}`);
  assert.ok(composeEstimateMessage("https://another.example", link).endsWith(link));
});

test("email copy renders user HTML as literal text", () => {
  assert.equal(escapeMessageHtml('<img src="x" onerror="alert(1)"> & hello'), '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt; &amp; hello');
});
