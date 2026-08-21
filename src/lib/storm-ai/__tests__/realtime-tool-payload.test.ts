import test from "node:test";
import assert from "node:assert/strict";
import {
  finalizeRealtimeToolPayload,
  isRealtimeToolResultOk,
  slimRealtimeToolResult,
  slimSearchNote,
} from "../realtime-tool-payload";

test("slimSearchNote mentions chat card only when one exists", () => {
  assert.match(slimSearchNote(null, true), /already shown in the chat panel/i);
  assert.match(slimSearchNote(null, false), /No chat card was attached/i);
  assert.doesNotMatch(slimSearchNote(null, false), /already shown/i);
});

test("slimRealtimeToolResult keeps ok and drops bulky descriptions", () => {
  const slimmed = slimRealtimeToolResult(
    "search_parts_info",
    {
      ok: true,
      data: {
        query: "black valve",
        parts: [
          {
            id: "p1",
            name: "DVF100",
            manufacturer: "Rain Bird",
            partNumber: "DVF100",
            section: "Valves",
            visualDescription: "x".repeat(500),
            technicalDescription: "y".repeat(500),
            hasManual: true,
            manualUrl: "https://example.com/m.pdf",
            manualKind: "pdf",
            photos: [{ id: "ph1", url: "/api/blob?pathname=a", fileName: "a.jpg" }],
          },
        ],
        visualMatch: { ran: false, confirmed: false },
      },
    },
    true
  ) as Record<string, unknown>;

  assert.equal(slimmed.ok, true);
  const data = slimmed.data as Record<string, unknown>;
  const part = (data.parts as Array<Record<string, unknown>>)[0]!;
  assert.equal(part.name, "DVF100");
  assert.equal("visualDescription" in part, false);
  assert.equal("technicalDescription" in part, false);
  assert.equal(part.photoCount, 1);
  assert.match(String(data.note), /already shown in the chat panel/i);
});

test("finalizeRealtimeToolPayload never returns a bare truncated stub", () => {
  const huge = {
    ok: true,
    data: {
      query: "valve",
      parts: Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        name: `Part ${i}`,
        manufacturer: "Rain Bird",
        partNumber: `PN${i}`,
        section: "Valves",
        visualDescription: "desc ".repeat(80),
        technicalDescription: "tech ".repeat(80),
        hasManual: false,
        photos: [],
      })),
      visualMatch: { ran: false, confirmed: false },
    },
  };

  const card = {
    kind: "parts_card",
    partId: "p0",
    name: "Part 0",
    manufacturer: "Rain Bird",
    partNumber: "PN0",
    section: "Valves",
    summary: "Part 0 by Rain Bird.",
    manualUrl: null,
    manualKind: null,
    photos: [],
  };

  const payload = finalizeRealtimeToolPayload(
    "search_parts_info",
    huge,
    card,
    // Force the truncate path that previously broke voice tools.
    () => ({ truncated: true, preview: '{"ok":true' }),
    100
  );

  assert.equal(payload.ok, true);
  assert.equal("truncated" in payload, false);
  assert.ok(payload.chatCard);
  assert.ok(payload.data);
});

test("isRealtimeToolResultOk treats missing ok with data as success", () => {
  assert.equal(isRealtimeToolResultOk({ ok: true, data: { parts: [] } }), true);
  assert.equal(isRealtimeToolResultOk({ data: { parts: [] }, chatCard: { kind: "parts_card" } }), true);
  assert.equal(isRealtimeToolResultOk({ ok: false, error: "nope" }), false);
  assert.equal(isRealtimeToolResultOk({ truncated: true, preview: "{" }), false);
});
