import test from "node:test";
import assert from "node:assert/strict";
import { Tracker, prepareRoute } from "../src/index.ts";

// A 2 km square loop (500 m sides at the equator, 0.0044916° ≈ 500 m).
const s = 0.0044916;
const square = () => prepareRoute([{ lat: 0, lon: 0 }, { lat: 0, lon: s }, { lat: s, lon: s }, { lat: s, lon: 0 }, { lat: 0, lon: 0 }], { loop: true });
const corners = [{ lat: 0, lon: s / 2 }, { lat: s / 2, lon: s }, { lat: s, lon: s / 2 }, { lat: s / 2, lon: 0 }];
const headings = [90, 0, 270, 180];

test("a vehicle on its third lap still measures forward, not backward", () => {
  const tracker = new Tracker(square(), { vMax: 1000 });
  let t = 0;
  for (let lap = 0; lap < 3; lap++)
    for (let i = 0; i < 4; i++) tracker.report({ ...corners[i]!, t: (t += 1000), heading: headings[i] });
  // Now at the middle of the west side (≈1750 m); the middle of the south side (≈250 m) is 500 m ahead.
  const d = tracker.distanceTo({ lat: 0, lon: s / 2 });
  assert.ok(d !== null && Math.abs(d - 500) < 2, `expected ≈500 m, got ${d}`);
  // And one more fix on the south side keeps it in the window.
  assert.ok(tracker.report({ lat: 0, lon: s / 2, t: (t += 1000), heading: 90 }));
});
