import assert from "node:assert/strict";
import test from "node:test";
import {
  newlyReachedPipelineStages,
  pipelineAdvanceData,
  pipelineSpeedSeconds,
} from "./pipeline";

const emptyPipeline = {
  pipelineStage: null,
  pipelineLeadAt: null,
  pipelineQualifiedAt: null,
  pipelineConvertedAt: null,
  pipelineSoldAt: null,
  pipelineDisqualifiedAt: null,
  pipelineLeadSource: null,
  pipelineFirstContactedAt: null,
  pipelineLeadId: null,
};

test("entering at a later stage fills every prior stage timestamp", () => {
  const at = new Date("2026-10-21T18:00:00.000Z");
  const update = pipelineAdvanceData(emptyPipeline, "CONVERTED", at, {
    leadSource: "Google Ads",
  });

  assert.equal(update?.pipelineStage, "CONVERTED");
  assert.equal(update?.pipelineLeadAt, at);
  assert.equal(update?.pipelineQualifiedAt, at);
  assert.equal(update?.pipelineConvertedAt, at);
  assert.equal(update?.pipelineSoldAt, null);
  assert.equal(update?.pipelineLeadSource, "Google Ads");
});

test("pipeline stages never regress or restart after sold", () => {
  const soldAt = new Date("2026-10-21T19:00:00.000Z");
  const sold = {
    ...emptyPipeline,
    pipelineStage: "SOLD" as const,
    pipelineLeadAt: soldAt,
    pipelineQualifiedAt: soldAt,
    pipelineConvertedAt: soldAt,
    pipelineSoldAt: soldAt,
  };

  assert.equal(pipelineAdvanceData(sold, "LEAD", new Date()), null);
  assert.equal(pipelineAdvanceData(sold, "SOLD", new Date()), null);
});

test("a later-stage event can recover a disqualified lead without losing its history", () => {
  const leadAt = new Date("2026-10-21T18:00:00.000Z");
  const disqualifiedAt = new Date("2026-10-21T18:05:00.000Z");
  const qualifiedAt = new Date("2026-10-22T18:00:00.000Z");
  const disqualified = {
    ...emptyPipeline,
    pipelineStage: "DISQUALIFIED" as const,
    pipelineLeadAt: leadAt,
    pipelineDisqualifiedAt: disqualifiedAt,
    pipelineLeadSource: "SMS",
  };

  assert.equal(pipelineAdvanceData(disqualified, "LEAD", qualifiedAt), null);
  const update = pipelineAdvanceData(disqualified, "QUALIFIED", qualifiedAt);
  assert.equal(update?.pipelineStage, "QUALIFIED");
  assert.equal(update?.pipelineLeadAt, leadAt);
  assert.equal(update?.pipelineQualifiedAt, qualifiedAt);
});

test("speed to lead is calculated from the first immutable timestamps", () => {
  assert.equal(
    pipelineSpeedSeconds({
      pipelineLeadAt: "2026-10-21T18:00:00.000Z",
      pipelineFirstContactedAt: "2026-10-21T18:04:30.000Z",
    }),
    270
  );
  assert.equal(
    pipelineSpeedSeconds({
      pipelineLeadAt: "2026-10-21T18:05:00.000Z",
      pipelineFirstContactedAt: "2026-10-21T18:04:30.000Z",
    }),
    null
  );
});

test("a direct conversion emits every newly reached stage", () => {
  assert.deepEqual(newlyReachedPipelineStages(null, "CONVERTED"), [
    "LEAD",
    "QUALIFIED",
    "CONVERTED",
  ]);
  assert.deepEqual(newlyReachedPipelineStages("LEAD", "SOLD"), [
    "QUALIFIED",
    "CONVERTED",
    "SOLD",
  ]);
  assert.deepEqual(newlyReachedPipelineStages("SOLD", "SOLD"), []);
});
