import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildPipelineIdentitySnapshot,
  normalizePipelineEmail,
  normalizePipelineUsPhone,
} from "./pipeline-conversion-identifiers";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("pipeline identity normalization hashes lowercase email and US E.164 phone", () => {
  assert.equal(normalizePipelineEmail(" JANE@EXAMPLE.COM "), "jane@example.com");
  assert.equal(normalizePipelineUsPhone("(801) 555-0100"), "+18015550100");
  assert.equal(normalizePipelineUsPhone("+1 801 555 0100"), "+18015550100");
  assert.equal(normalizePipelineUsPhone("555"), null);

  const snapshot = buildPipelineIdentitySnapshot({
    email: " JANE@EXAMPLE.COM ",
    phone: "(801) 555-0100",
    gclid: " click-id ",
    metaLeadId: " 1485075230355177 ",
  });
  assert.equal(snapshot.emailSha256, hash("jane@example.com"));
  assert.equal(snapshot.phoneSha256, hash("+18015550100"));
  assert.equal(snapshot.gclid, "click-id");
  assert.equal(snapshot.metaLeadId, "1485075230355177");
});
