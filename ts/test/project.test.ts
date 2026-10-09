import test from "node:test";
import assert from "node:assert/strict";
import { prepareRoute } from "../src/index.ts";

test("project clamps to both segment ends", () => {
  const route = prepareRoute([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }], { loop: false });
  assert.ok(route.project({ lat: 0, lon: -0.001 }).progress === 0);
  assert.ok(Math.abs(route.project({ lat: 0, lon: 0.002 }).progress - route.length) < 1e-8);
});

test("project skips zero-length segments", () => {
  const route = prepareRoute([{ lat: 0, lon: 0 }, { lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }], { loop: false });
  assert.ok(Math.abs(route.project({ lat: 0, lon: 0.0005 }).progress - route.length / 2) < 1e-8);
});

test("project requires two points and a nonzero segment", () => {
  assert.throws(() => prepareRoute([{ lat: 0, lon: 0 }]), /at least two points/);
  assert.throws(() => prepareRoute([{ lat: 0, lon: 0 }, { lat: 0, lon: 0 }]), /non-zero-length segment/);
});
