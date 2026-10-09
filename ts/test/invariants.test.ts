import test from "node:test";
import assert from "node:assert/strict";
import { Tracker, prepareRoute } from "../src/index.ts";
import { restore, snapshot } from "../src/snapshot.ts";

const initialSeed = 0x51a7e;
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
const pick = (r: () => number, a: number, b: number) => a + r() * (b - a);
type Point = { lat: number; lon: number };

function pointAt(points: Point[], progress: number): Point {
  let left = progress;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = (b.lon - a.lon) * 111319, dy = (b.lat - a.lat) * 111319;
    const length = Math.hypot(dx, dy);
    if (left <= length || i === points.length - 1) {
      const f = Math.min(1, left / length);
      return { lat: a.lat + dy * f / 111319, lon: a.lon + dx * f / 111319 };
    }
    left -= length;
  }
  return points.at(-1)!;
}

test("windowed matching keeps a nearby fix on its progress branch", () => {
  const route = prepareRoute([
    { lat: 0, lon: 0 }, { lat: 0, lon: 0.018 },
    { lat: 0.01, lon: 0.018 }, { lat: 0.01, lon: 0.00988 },
    { lat: 0.00027, lon: 0.00988 },
  ], { loop: false });
  const tracker = new Tracker(route, { vMax: 25 });
  const first = tracker.report({ lat: 0, lon: 0.00988, t: 1000 });
  const next = tracker.report({ lat: 0.00027, lon: 0.00988, t: 2000 });
  assert.ok(first && next);
  assert.ok(Math.abs(first.progress - 1100) < 2, `first=${first.progress}`);
  assert.ok(Math.abs(next.progress - first.progress) < 100,
    `progress jumped ${first.progress} -> ${next.progress}`);
});

test("at caps extrapolation speed at vMax", () => {
  const route = prepareRoute([
    { lat: 0, lon: 0 }, { lat: 0, lon: 0.02 },
  ], { loop: false });
  const tracker = new Tracker(route, { vMax: 20 });
  tracker.report({ lat: 0, lon: 0, t: 1000 });
  const second = tracker.report({
    lat: 0, lon: 100 / (6378137 * Math.PI / 180), t: 2000,
  });
  assert.ok(second);
  const frame = tracker.at(3000)!;
  assert.ok(frame.progress - second.progress <= 20.01,
    `vMax extrapolation invariant: ${second.progress} -> ${frame.progress}`);
});

test("seeded Tracker invariants", () => {
  for (let scenario = 0; scenario < 200; scenario++) {
    const seed = (initialSeed + scenario) >>> 0, r = rng(seed);
    try {
      const loop = r() < 0.5, count = 5 + Math.floor(r() * 196);
      const points: Point[] = [{ lat: 0, lon: 0 }];
      for (let i = 1; i < count; i++) {
        const angle = pick(r, 0, Math.PI * 2), distance = pick(r, 80, 220);
        const p = points[i - 1]!;
        points.push({ lat: p.lat + Math.sin(angle) * distance / 111319,
          lon: p.lon + Math.cos(angle) * distance / 111319 });
      }
      const route = prepareRoute(points, { loop }), vMax = 20;
      const tracker = new Tracker(route, { vMax });
      let resumed: Tracker | undefined;
      let t = 0, distance = 0, reverseLeft = 0;
      let lastReport: { absolute: number; t: number; held: boolean } | undefined;
      let lastFrame: { absolute: number; t: number } | undefined;
      for (let i = 0; i < 10; i++) {
        const speed = pick(r, 3, 20);
        const gap = i > 0 && r() < 0.2 ? pick(r, 10000, 200000) : pick(r, 1000, 5000);
        t += gap;
        distance = Math.min(route.length - 1, distance + speed * gap / 1000);
        if (!reverseLeft && r() < 0.15) reverseLeft = 2;
        const reversing = reverseLeft > 0;
        if (reversing) { distance = Math.max(0, distance - pick(r, 45, 80)); reverseLeft--; }
        const fix = pointAt(points, distance);
        const angle = pick(r, 0, Math.PI * 2), noise = pick(r, 0, 25) / 111319;
        fix.lat += Math.sin(angle) * noise;
        fix.lon += Math.cos(angle) * noise;
        if (r() < 0.12) fix.lat += pick(r, 100, 500) / 111319;

        const reading = tracker.report({ ...fix, t });
        if (resumed) assert.deepEqual(resumed.report({ ...fix, t }), reading);
        if (i === 4) resumed = restore(route, JSON.parse(JSON.stringify(snapshot(tracker))));
        if (!reading) {
          if (lastReport) lastReport.held = false;
        }
        else {
          const absolute = reading.progress + reading.lap * (loop ? route.length : 0);
          if (reading.state === "offRoute") {
            if (lastReport) lastReport.held = false;
          }
          else {
            if (lastReport) {
              const dt = t - lastReport.t;
              const limit = lastReport.absolute + vMax * dt / 1000 + 100.01;
              assert.ok(absolute <= limit,
                `report window invariant: ${lastReport.absolute} -> ${absolute}; limit=${limit}`);
              if (absolute < lastReport.absolute - 0.01) {
                const backwardLimit = vMax * dt / 1000 + 100;
                assert.ok(lastReport.held && lastReport.absolute - absolute <= backwardLimit,
                  `progress invariant: ${lastReport.absolute} -> ${absolute}; ` +
                    `previous report held=${lastReport.held}; ` +
                    `drop limit=${backwardLimit}; dt=${dt} ms`);
              }
            }
            const held = lastReport !== undefined &&
              Math.abs(absolute - lastReport.absolute) <= 0.01;
            lastReport = { absolute, t, held };
          }
          check(reading, route, loop);
          const copy = tracker.at(t)!;
          reading.progress = 0;
          reading.point.lat = 80;
          assert.ok(Math.abs(tracker.at(t)!.progress - copy.progress) < 1e-6,
            `report copy invariant: expected ${copy.progress}, got ${tracker.at(t)!.progress}`);
        }
        const atReport = tracker.at(t);
        if (resumed) assert.deepEqual(resumed.at(t), atReport);
        if (atReport) lastFrame = { absolute: atReport.progress + atReport.lap * route.length, t };
        const state45 = tracker.state(t + 45001), state300 = tracker.state(t + 300001);
        if (state45 !== "offRoute") assert.equal(state45, "stale");
        if (state300 !== "offRoute") assert.equal(state300, "lost");
        for (const now of [t + 500, t + 6000, t + 9500]) {
          const at = tracker.at(now);
          if (!at) continue;
          check(at, route, loop);
          assert.equal(at.state, tracker.state(now));
          if (at.state !== "offRoute") assert.equal(at.state,
            now - t <= 45000 ? "live" : now - t <= 300000 ? "stale" : "lost");
          if (!loop) assert.ok(at.progress <= route.length + 1e-6);
          const absolute = at.progress + at.lap * route.length;
          if (lastFrame && now > lastFrame.t) {
            const limit = vMax * (now - lastFrame.t) / 1000 + 100.01;
            assert.ok(absolute <= lastFrame.absolute + limit,
              `frame bound: ${lastFrame.absolute} -> ${absolute}; ` +
                `dt=${now - lastFrame.t}; limit=${limit}`);
          }
          lastFrame = { absolute, t: now };
          const before = tracker.at(now)!;
          at.progress = 0;
          at.point.lat = 80;
          const after = tracker.at(now)!;
          assert.notEqual(after.point.lat, 80, "at() copy invariant: latitude mutation leaked");
          assert.ok(Math.abs(after.progress - before.progress) < 1e-6,
            `at() copy invariant: expected ${before.progress}, got ${after.progress}`);
        }
      }
    } catch (error) {
      throw new Error(`seed=${seed} scenario=${scenario}: ${String(error)}`, { cause: error });
    }
  }
});

function check(reading: any, route: any, loop: boolean) {
  assert.ok(reading.progress >= 0 &&
    reading.progress < (loop ? route.length : route.length + 1e-7));
  if (!loop) assert.equal(reading.lap, 0);
  assert.ok(route.project(reading.point).offset < 0.5);
}
