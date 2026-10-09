import { prepareRoute, Tracker } from '../src/index.ts';

const pointCount = 20_000;
const iterations = 10_000;
let seed = 0x5eed;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};

const points = [];
let lat = 40;
let lon = -73;
for (let i = 0; i < pointCount; i++) {
  points.push({ lat, lon });
  lat += (random() - 0.5) * 0.00001;
  lon += 0.0001 + (random() - 0.5) * 0.00001;
}

const route = prepareRoute(points, { loop: false });
const tracker = new Tracker(route);
const fixes = Array.from({ length: iterations }, (_, i) => {
  const index = Math.floor(i * (pointCount - 1) / iterations);
  const point = points[index];
  return { ...point, t: i * 1000 };
});
tracker.report({ ...fixes[0], t: -1000 });

function measure(label, operation) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) operation(i);
  const elapsedSeconds = (performance.now() - start) / 1000;
  console.log(`${label}: ${(iterations / elapsedSeconds).toFixed(0)} ops/sec`);
}

measure('project()', i => route.project(fixes[i]));
measure('Tracker.report()', i => tracker.report(fixes[i]));
