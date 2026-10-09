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

test("mutating an off-route or stale Reading cannot mutate tracker state", () => {
  const tracker = new Tracker(prepareRoute([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.0089831 }], { loop: false }));
  const valid = tracker.report({ lat: 0, lon: 0.0017966, t: 1000, heading: 90 });
  assert.ok(valid);

  const offRoute = tracker.report({ lat: 0.00089831, lon: 0.00449155, t: 2000, heading: 90 });
  assert.ok(offRoute);
  offRoute.progress = 0;
  offRoute.point.lat = 50;

  const staleAfterOffRoute = tracker.report({ lat: 0, lon: 0.0017966, t: 1000, heading: 90 });
  assert.ok(staleAfterOffRoute);
  assert.equal(staleAfterOffRoute.state, "offRoute");
  assert.ok(Math.abs(staleAfterOffRoute.progress - valid.progress) < 0.1);
  assert.ok(Math.abs(staleAfterOffRoute.point.lat) < 1e-8);
  staleAfterOffRoute.progress = 0;
  staleAfterOffRoute.point.lon = 50;

  const staleAgain = tracker.report({ lat: 0, lon: 0.0017966, t: 1000, heading: 90 });
  assert.ok(staleAgain);
  assert.ok(Math.abs(staleAgain.progress - valid.progress) < 0.1);
  assert.ok(Math.abs(staleAgain.point.lon - valid.point.lon) < 1e-8);

  const next = tracker.report({ lat: 0, lon: 0.00269493, t: 3000, heading: 90 });
  assert.ok(next);
  assert.ok(Math.abs(next.progress - 300) < 1, `expected ≈300 m, got ${next.progress}`);
  const distance = tracker.distanceTo({ lat: 0, lon: 0.00718648 });
  assert.ok(distance !== null && Math.abs(distance - 500) < 1, `expected ≈500 m, got ${distance}`);
});
