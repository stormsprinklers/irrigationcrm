import assert from "node:assert/strict";
import test from "node:test";
import { canAccessBlobPath, canPublicAccessBlobPath } from "./urls";

test("estimate VSL videos are company-scoped and publicly streamable", () => {
  const pathname = "estimate-vsl/company-1/intro.mp4";
  assert.equal(canAccessBlobPath("company-1", pathname), true);
  assert.equal(canAccessBlobPath("company-2", pathname), false);
  assert.equal(canPublicAccessBlobPath(pathname), true);
});
