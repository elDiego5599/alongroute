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
        if (step.report) tracker.report(step.report);
        if (step.distanceTo) {
          const actual = tracker.distanceTo(step.distanceTo), expected = step.expect.distance;
          if (expected === null) assert.equal(actual, null, step.why);
          else assert.ok(actual !== null && Math.abs(actual - expected[0]) <= expected[1], `expected ${expected[0]}±${expected[1]}, got ${actual}; ${step.why}`);
        }
      } catch (error) { throw new Error(`${file}, step ${index}: ${step.why}`, { cause: error }); }
    });
  });
}
