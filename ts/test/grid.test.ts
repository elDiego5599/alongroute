import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareRoute, type Point } from "../src/index.ts";

const seed = (start: number) => { let n = start >>> 0; return () => ((n = (1664525 * n + 1013904223) >>> 0) / 2 ** 32); };
const walk = () => { const rand = seed(481516); const points: Point[] = [{ lat: 4.6, lon: -74.1 }]; for (let i = 1; i < 5000; i++) { const a = (rand() - 0.5) * 1.2, d = 5 + rand() * 20, p = points[i - 1]!; points.push({ lat: p.lat + Math.cos(a) * d / 111320, lon: p.lon + Math.sin(a) * d / (111320 * Math.cos(p.lat * Math.PI / 180)) }); } return points; };
function queries(routePoints: Point[], random: () => number): Point[] {
  const minLat = Math.min(...routePoints.map(p => p.lat)), maxLat = Math.max(...routePoints.map(p => p.lat)), minLon = Math.min(...routePoints.map(p => p.lon)), maxLon = Math.max(...routePoints.map(p => p.lon));
  const out = Array.from({ length: 500 }, () => ({ lat: minLat + random() * (maxLat - minLat), lon: minLon + random() * (maxLon - minLon) }));
  for (let i = 0; i < 100; i++) { const p = routePoints[Math.floor(random() * routePoints.length)]!; out.push(p); }
  for (const d of [1000, 3000, 5000]) for (let i = 0; i < 4; i++) out.push({ lat: minLat - d / 111320, lon: minLon - d / (111320 * Math.cos(minLat * Math.PI / 180)) });
  return out;
}
function compare(points: Point[], loop?: boolean) {
  const route = prepareRoute(points, { loop }), rand = seed(points.length + (loop ? 1 : 0));
  for (const point of queries(points, rand)) {
    const q = route._local(point);
    const expected = route._segments.map(s => { const t = Math.max(0, Math.min(1, ((q.x - s.x) * s.dx + (q.y - s.y) * s.dy) / s.length ** 2)); return { progress: s.start + t * s.length, offset: Math.hypot(q.x - s.x - t * s.dx, q.y - s.y - t * s.dy) }; });
    const nearest = expected.reduce((a, b) => a.offset < b.offset ? a : b);
    const actual = route._candidates(point), indexedNearest = actual.reduce((a, b) => a.offset < b.offset ? a : b);
    const expectedSet = expected.filter(c => c.offset <= nearest.offset + 15), actualSet = actual.filter(c => c.offset <= indexedNearest.offset + 15);
    assert.equal(actualSet.length, expectedSet.length, `candidate set at ${JSON.stringify(point)}`);
    for (let i = 0; i < expectedSet.length; i++) { assert.ok(Math.abs(actualSet[i]!.progress - expectedSet[i]!.progress) <= 1e-6); assert.ok(Math.abs(actualSet[i]!.offset - expectedSet[i]!.offset) <= 1e-6); }
    const chosen = expected.filter(c => c.offset <= nearest.offset + 15).sort((a, b) => a.offset - b.offset)[0]!;
    const projected = route.project(point);
    assert.ok(Math.abs(projected.progress - chosen.progress) <= 1e-6);
    assert.ok(Math.abs(projected.offset - chosen.offset) <= 1e-6);
  }
}

test("grid matches linear scan on seeded 5,000 point walks", () => { const points = walk(); compare(points, false); compare(points, true); });
test("grid matches linear scan on every vector route", async () => {
  const files = (await readdir(resolve(import.meta.dirname, "../../vectors"))).filter(f => f.endsWith(".json"));
  for (const file of files) { const v = JSON.parse(await readFile(resolve(import.meta.dirname, `../../vectors/${file}`), "utf8")); compare(v.route.points, v.route.loop); }
});
test("project checks under five percent of 5,000 route segments", () => {
  const route = prepareRoute(walk(), { loop: false }), p = route.points[2500]!;
  route.project(p);
  assert.ok(route._distanceChecks() < route._segments.length * 0.05, `${route._distanceChecks()} checks for ${route._segments.length} segments`);
});
