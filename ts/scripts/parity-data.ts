import { Tracker, prepareRoute } from "../src/index.ts";

const initialSeed = 0x51a7e;
type Point = { lat: number; lon: number };

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

function rounded(value: number): number {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
}

function snapshot(reading: ReturnType<Tracker["at"]>) {
  if (!reading) return null;
  return {
    progress: rounded(reading.progress), lap: reading.lap,
    point: { lat: rounded(reading.point.lat), lon: rounded(reading.point.lon) },
    heading: rounded(reading.heading), state: reading.state,
    offset: rounded(reading.offset),
  };
}

export function parityTraces() {
  const scenarios = [];
  for (let scenario = 0; scenario < 20; scenario++) {
    const seed = (initialSeed + scenario) >>> 0, r = rng(seed);
    const loop = r() < 0.5, count = 5 + Math.floor(r() * 196);
    const points: Point[] = [{ lat: 0, lon: 0 }];
    for (let i = 1; i < count; i++) {
      const angle = pick(r, 0, Math.PI * 2), distance = pick(r, 80, 220);
      const p = points[i - 1]!;
      points.push({ lat: p.lat + Math.sin(angle) * distance / 111319,
        lon: p.lon + Math.cos(angle) * distance / 111319 });
    }
    const route = prepareRoute(points, { loop }), tracker = new Tracker(route, { vMax: 20 });
    let t = 0, distance = 0, reverseLeft = 0;
    const readings: { kind: string; t: number; reading: ReturnType<typeof snapshot> }[] = [];
    for (let i = 0; i < 10; i++) {
      const speed = pick(r, 3, 20);
      const gap = i > 0 && r() < 0.2 ? pick(r, 10000, 200000) : pick(r, 1000, 5000);
      t += gap;
      distance = Math.min(route.length - 1, distance + speed * gap / 1000);
      if (!reverseLeft && r() < 0.15) reverseLeft = 2;
      if (reverseLeft > 0) { distance = Math.max(0, distance - pick(r, 45, 80)); reverseLeft--; }
      const fix = pointAt(points, distance);
      const angle = pick(r, 0, Math.PI * 2), noise = pick(r, 0, 25) / 111319;
      fix.lat += Math.sin(angle) * noise;
      fix.lon += Math.cos(angle) * noise;
      if (r() < 0.12) fix.lat += pick(r, 100, 500) / 111319;
      readings.push({ kind: "report", t, reading: snapshot(tracker.report({ ...fix, t })) });
      for (const offset of [6000]) {
        const now = t + offset;
        readings.push({ kind: "at", t: now, reading: snapshot(tracker.at(now)) });
      }
    }
    scenarios.push({ scenario, seed, readings });
  }
  return { scenarios };
}
