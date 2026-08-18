import test from "node:test";
import assert from "node:assert/strict";
import { rankPartsByVisualMatch, visualMatchNote, type PartsSearchHit } from "../parts-vision-match";

function hit(id: string, photoId = `${id}-p1`): PartsSearchHit {
  return {
    id,
    name: id,
    manufacturer: null,
    partNumber: null,
    section: "Valves",
    visualDescription: null,
    technicalDescription: null,
    hasManual: false,
    manualUrl: null,
    manualKind: null,
    photoCount: 1,
    photos: [{ id: photoId, url: `https://example.com/${photoId}.jpg`, fileName: "a.jpg" }],
  };
}

test("rankPartsByVisualMatch moves the matched part first and leads with its photo", () => {
  const ranked = rankPartsByVisualMatch([hit("a"), hit("b"), hit("c")], {
    ran: true,
    confirmed: true,
    partId: "b",
    photoId: "b-p1",
    confidence: 0.9,
    reason: "same body",
  });
  assert.equal(ranked[0]?.id, "b");
  assert.equal(ranked[0]?.matchedPhotoId, "b-p1");
  assert.equal(ranked[0]?.photos[0]?.id, "b-p1");
  assert.deepEqual(
    ranked.slice(1).map((row) => row.id),
    ["a", "c"]
  );
});

test("visualMatchNote tells the model not to confirm without a photo match", () => {
  assert.match(
    visualMatchNote(
      {
        ran: true,
        confirmed: false,
        partId: null,
        photoId: null,
        confidence: 0.2,
        reason: "different ports",
      },
      3
    ),
    /cannot confirm/i
  );
});
