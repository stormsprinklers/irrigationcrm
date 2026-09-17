import test from "node:test";
import assert from "node:assert/strict";
import { summarizeWebsiteEvents, summarizeWebsiteTimeline } from "../website-analytics";

const event = (sessionId: string, date: string, eventType = "PAGE_VIEW") => ({ sessionId, occurredAt: new Date(date), eventType, pagePath: "/", metadata: { source_bucket: "google_organic" } });
test("deduplicates browser totals and counts sources by page view, excluding heartbeats", () => {
  const out = summarizeWebsiteEvents([event("a", "2026-09-01"), event("a", "2026-09-01"), event("a", "2026-09-01", "TEL_CLICK"), event("b", "2026-09-01", "VISITOR_HEARTBEAT")]);
  assert.equal(out.totalVisitors, 1);
  assert.equal(out.totalPageViews, 2);
  assert.equal(out.totalEvents, 3);
  assert.equal(out.conversions.organicConversions, 1);
  assert.equal(out.topSourceBuckets[0].count, 2);
});
test("daily series includes empty dates and deduplicates visitors independently per day", () => {
  const events = [event("a", "2026-09-01"), event("a", "2026-09-03"), event("a", "2026-09-03")];
  const daily = summarizeWebsiteTimeline(events, { from: new Date("2026-09-01"), to: new Date("2026-09-03T23:59:59Z") });
  assert.deepEqual(daily.map((d) => d.totalVisitors), [1,0,1]);
  assert.equal(summarizeWebsiteEvents(events).totalVisitors, 1);
  assert.equal(daily[1].homepage.avgDwellSeconds, null);
});

test("dwell time uses the latest snapshot from each page visit", () => {
  const visits = [
    { ...event("a", "2026-09-01", "TIME_ON_PAGE"), metadata: { seconds: 10, page_view_id: "first" } },
    { ...event("a", "2026-09-01", "TIME_ON_PAGE"), metadata: { seconds: 42, page_view_id: "first" } },
    { ...event("b", "2026-09-01", "TIME_ON_PAGE"), metadata: { seconds: 20, page_view_id: "second" } },
  ];
  const result = summarizeWebsiteEvents(visits);
  assert.equal(result.homepage.dwellSamples, 2);
  assert.equal(result.homepage.avgDwellSeconds, 31);
});
