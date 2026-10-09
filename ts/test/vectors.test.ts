import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Tracker, prepareRoute } from "../src/index.ts";

const files = (await readdir(resolve(import.meta.dirname, "../../vectors"))).filter(f => f.endsWith(".json"));
for (const file of files) {
  const vector = JSON.parse(await readFile(resolve(import.meta.dirname, `../../vectors/${file}`), "utf8"));
  test(vector.name, () => {
    const tracker = new Tracker(prepareRoute(vector.route.points, { loop: vector.route.loop }), vector.options);
    vector.steps.forEach((step: any, index: number) => {
      try {
        if (step.report) {
          const actual = tracker.report(step.report);
          if (step.expect?.state !== undefined && step.stateAt === undefined) assert.equal(actual?.state, step.expect.state, step.why);
          if (step.expect?.lap !== undefined) assert.equal(actual?.lap, step.expect.lap, step.why);
          if (step.expect?.heading) assert.ok(actual !== null && Math.abs(((actual.heading - step.expect.heading[0] + 540) % 360) - 180) <= step.expect.heading[1], `expected heading ${step.expect.heading[0]}±${step.expect.heading[1]}, got ${actual?.heading}; ${step.why}`);
          if (step.expect?.progress) {
            assert.ok(actual !== null && Math.abs(actual.progress - step.expect.progress[0]) <= step.expect.progress[1], `expected progress ${step.expect.progress[0]}±${step.expect.progress[1]}, got ${actual?.progress}; ${step.why}`);
          }
        }
        if (step.stateAt !== undefined) assert.equal(tracker.state(step.report?.t + step.stateAt), step.expect.state, step.why);
        if (step.distanceTo) {
          const actual = tracker.distanceTo(step.distanceTo), expected = step.expect.distance;
          if (expected === null) assert.equal(actual, null, step.why);
          else assert.ok(actual !== null && Math.abs(actual - expected[0]) <= expected[1], `expected ${expected[0]}±${expected[1]}, got ${actual}; ${step.why}`);
        }
      } catch (error) { throw new Error(`${file}, step ${index}: ${step.why}`, { cause: error }); }
    });
  });
}
