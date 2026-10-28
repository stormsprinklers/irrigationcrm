import assert from "node:assert/strict";
import test from "node:test";
import { MAX_ESTIMATE_VSL_VIDEO_BYTES } from "./estimate-vsl-upload";

test("estimate VSL uploads allow the Blob multipart maximum", () => {
  assert.equal(MAX_ESTIMATE_VSL_VIDEO_BYTES, 5 * 1024 ** 4);
});

