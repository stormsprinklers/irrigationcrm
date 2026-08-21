import test from "node:test";
import assert from "node:assert/strict";
import { formatPartsCardMarkdown, partsCardSummary, partRecordToCard } from "../parts-card";

test("partsCardSummary is a short ID blurb without library descriptions", () => {
  assert.equal(
    partsCardSummary({
      name: "PGV-101",
      manufacturer: "Hunter",
      partNumber: "PGV101",
      section: "Valves",
    }),
    "PGV-101 by Hunter. Part number PGV101. Listed under Valves."
  );
});

test("partRecordToCard remaps absolute blob proxy URLs to same-origin paths", () => {
  const card = partRecordToCard({
    id: "p1",
    name: "PGV-101",
    photos: [
      {
        id: "ph1",
        url: "https://app.example.com/api/blob?pathname=parts-info%2Fc1%2Fa.jpg",
        fileName: "a.jpg",
      },
    ],
  });
  assert.ok(card);
  assert.equal(card!.photos[0]!.url, "/api/blob?pathname=parts-info%2Fc1%2Fa.jpg");
});
