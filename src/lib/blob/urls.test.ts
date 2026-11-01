import assert from "node:assert/strict";
import test from "node:test";
import {
  absolutePublicBlobUrl,
  canAccessBlobPath,
  canPublicAccessBlobPath,
} from "./urls";

test("estimate VSL videos are company-scoped and publicly streamable", () => {
  const pathname = "estimate-vsl/company-1/intro.mp4";
  assert.equal(canAccessBlobPath("company-1", pathname), true);
  assert.equal(canAccessBlobPath("company-2", pathname), false);
  assert.equal(canPublicAccessBlobPath(pathname), true);
});

test("holiday preview images are publicly accessible without exposing other estimate files", () => {
  assert.equal(
    canPublicAccessBlobPath("company-holiday/company-1/holiday-quotes/quote-1/options/a.jpg"),
    true
  );
  assert.equal(
    canPublicAccessBlobPath("estimates/company-1/holiday-quotes/quote-1/options/a.jpg"),
    true
  );
  assert.equal(canPublicAccessBlobPath("estimates/company-1/signatures/customer.png"), false);
  assert.equal(canPublicAccessBlobPath("estimates/company-1/holiday-quotes/quote-1/source.jpg"), false);
});

test("legacy uploaded holiday previews use the public blob proxy", () => {
  const storedUrl =
    "https://private.blob.vercel-storage.com/estimates/company-1/holiday-quotes/quote-1/options/a.jpg";

  assert.equal(
    absolutePublicBlobUrl(storedUrl, "https://portal.example.com"),
    "https://portal.example.com/api/public/blob?pathname=estimates%2Fcompany-1%2Fholiday-quotes%2Fquote-1%2Foptions%2Fa.jpg"
  );
});
