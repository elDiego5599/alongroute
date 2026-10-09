import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Tracker, prepareRoute } from "../src/index.ts";
import { restore, snapshot, type TrackerSnapshot } from "../src/snapshot.ts";

const route = () => prepareRoute([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.02 }], { loop: false });
test("snapshot JSON round trip and shared fixture", () => {
  const r = route(), fixture = JSON.parse(readFileSync("../fixtures/snapshot.json", "utf8")) as TrackerSnapshot;
  assert.deepEqual(Object.keys(snapshot(new Tracker(r))).sort(), ["version", "previousProgress", "previousT", "current", "lapBefore", "lastFixT", "offRoute", "lap", "speed", "drawFloor", "drawT", "drawBase", "backwardFrom", "backwardCandidate", "options"].sort());
  const restored = restore(r, JSON.parse(JSON.stringify(fixture)));
  assert.equal(restored.at(6000)?.progress, 500);
  assert.equal(restored.at(6000)?.heading, 90);
  const tracker = new Tracker(r); tracker.report({ lat: 0, lon: 0.001, t: 1 });
  assert.deepEqual(restore(r, JSON.parse(JSON.stringify(snapshot(tracker)))).at(100), tracker.at(100));
});

test("snapshot rejects invalid version, numbers, and progress", () => {
  const r = route(), base = snapshot(new Tracker(r));
  const reading = { progress: 0, lap: 0, point: { lat: 0, lon: 0 }, heading: 0, state: "live", offset: 0 };
  const badSnapshots = [
    { ...base, version: 2 }, { ...base, speed: Infinity }, { ...base, previousProgress: r.length + 1 },
    { ...base, speed: "5" }, { ...base, offRoute: "yes" }, { ...base, lap: 1.5 },
    { ...base, current: { ...reading, state: "flying" } },
    { ...base, current: { lap: 0, point: reading.point, heading: 0, state: "live", offset: 0 } },
    { ...base, current: { ...reading, extra: 1 } },
    { ...base, current: { ...reading, point: { lat: 0 } } },
    { ...base, current: { ...reading, point: { lat: 0, lon: 0, extra: 1 } } },
    { ...base, current: { ...reading, point: [] } },
    { ...base, options: "x" }, { ...base, options: [] }, { ...base, options: { vMax: 1, extra: 2 } },
  ];
  for (const bad of badSnapshots)
    assert.throws(() => restore(r, bad as unknown as TrackerSnapshot));
  assert.throws(() => restore(r, { ...base, route: {} } as unknown as TrackerSnapshot));
});
