# alongroute

[![CI](https://github.com/elDiego5599/alongroute/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/elDiego5599/alongroute/actions/workflows/ci.yml)

**Turn sparse, noisy GPS fixes into a vehicle that moves _along its route_ —
never jumping backwards, never cutting corners — and measure the distance
that is left _along the route_, not in a straight line.**

Dart and TypeScript. Zero dependencies. No network, no map SDK: it returns
numbers, and you draw them on whatever map you use.

> **Status: design phase.** Nothing is published yet. The core ideas are
> being proven first inside [Ya Viene](https://yavienetech.com), a live bus
> tracker for Barranquilla, Colombia. The package is extracted once it has
> run against real GPS traces. Read the [design](docs/design.md) and the
> [roadmap](#roadmap) below.

---

## The problem

A transit or fleet app gets one fix every 1–30 s, with 5–30 m of error, and
it already knows the route the vehicle drives. What almost every app shows:

| Symptom | Cause |
|---|---|
| The bus cuts corners | It is animated in a straight line between two fixes |
| The bus jitters or slides back a few metres | GPS noise is drawn as-is |
| On two-way streets the bus "teleports" to the opposite direction | Each fix snaps to the **nearest** segment, not the one **consistent** with where the bus was going |
| The bus freezes or vanishes with no explanation | There is no state for "this signal is old" |
| "400 m away" when there are 3 km of route left | Distance is measured as the crow flies |

Map-matching engines (OSRM, Valhalla, Mapbox) solve a different problem:
snapping to an **unknown** road network, on a server. Here the route is
known in advance and the answer has to come out on the phone, every frame.

## Core ideas

1. **Project with memory.** The first fix searches the whole route. Every
   later fix only searches a window around where the vehicle was:
   `[progress − 50 m, progress + vMax·Δt + 100 m]`. A bus going north on a
   two-way street can't suddenly be going south.
2. **Break ties with heading.** When two candidate segments are within
   15 m of each other (out-and-back on the same street), the fix's heading
   is compared with each segment's direction. No heading: wait for the next
   fix.
3. **Progress only moves forward.** Backward moves under a tolerance (30 m)
   are noise and are ignored. A larger, sustained backward move is accepted
   smoothly, never as a jump. On a loop route, passing the end adds a lap
   instead of falling back to zero.
4. **Interpolate on the polyline.** Between fixes the position advances
   along the route at the smoothed speed, so it turns corners. It
   extrapolates for a few seconds, then eases to a stop. If a fix arrives
   behind the drawn position, the drawing waits instead of going back.
5. **Distance along the route.** Measure forward to the point's next pass;
   on a loop, wrap to its next lap. Up to 30 m past the point counts as 0
   (GPS noise). Add the point's perpendicular offset to the route. Return
   `null` if every pass is behind on an open route, if the point is over
   300 m off-route, or if the vehicle is over 60 m off-route. The caller
   chooses a fallback, such as straight-line distance.
6. **Explicit freshness.** Every reading carries a state — `live`, `stale`,
   `lost` or `offRoute` — so the UI can say what is going on instead of
   freezing.
7. **One behaviour, two languages.** Dart and TypeScript run the same JSON
   test vectors, each with its own tolerance in metres.

## API

```ts
import { prepareRoute, Tracker, type Point, type Fix, type Reading } from "alongroute";

const points: Point[] = [{ lat: 53.0, lon: -1.0 }, { lat: 53.001, lon: -1.0 }];
const route = prepareRoute(points, { loop: false });
const bus = new Tracker(route);
const reading: Reading | null = bus.report({ lat: 53, lon: -1, t: 1000 });
const state = bus.state(1000);
const drawn: Reading | null = bus.at(1500);
const remaining: number | null = bus.distanceTo({ lat: 53.001, lon: -1 });
const projection = route.project({ lat: 53, lon: -1 });
```

```ts
// TypeScript exports
type Point = { lat: number; lon: number };
type Fix = Point & { t: number; heading?: number; speed?: number; accuracy?: number };
type Projection = { progress: number; offset: number };
type Reading = {
  progress: number; // metres from the start, in [0, length)
  lap: number; // completed laps; progress + lap * length never drops
  point: Point;
  heading: number; // route tangent at this point
  state: TrackerState;
  offset: number; // metres from the last fix to the route
};
type TrackerState = 'live' | 'stale' | 'lost' | 'offRoute';
prepareRoute(points: Point[], options?: { loop?: boolean }): {
  points: Point[]; loop: boolean; length: number;
  project(point: Point): Projection;
};
new Tracker(route: ReturnType<typeof prepareRoute>, options?: {
  vMax?: number; maxOffset?: number; maxStopOffset?: number; staleMs?: number;
  lostMs?: number; speedAlpha?: number; extrapolateMs?: number; easeMs?: number;
});
// Option defaults:
// vMax=25, maxOffset=60, maxStopOffset=300, staleMs=30000, lostMs=120000,
// speedAlpha=0.4, extrapolateMs=5000, easeMs=3000
Tracker.report(fix: Fix): Reading | null; // snapped reading, or null before a usable fix
Tracker.state(nowMs: number): TrackerState; // freshness/off-route state at this time
Tracker.at(nowMs: number): Reading | null; // interpolated drawing position, or null before a reading
Tracker.distanceTo(point: Point): number | null; // forward route distance, or null when unavailable
route.project(point: Point): Projection; // stateless nearest route projection
```

```dart
import 'package:alongroute/alongroute.dart';

final points = [
  const Point(lat: 53, lon: -1),
  const Point(lat: 53.001, lon: -1),
];
final route = prepareRoute(points, loop: false);
final bus = Tracker(route);
final Reading? reading = bus.report(const Fix(lat: 53, lon: -1, t: 1000));
final TrackerState state = bus.state(1000);
final Reading? drawn = bus.at(1500);
final double? remaining = bus.distanceTo(points.last);
final Projection projection = route.project(points.first);
```

| Tracker option | Default | Meaning |
|---|---:|---|
| `vMax` | 25 | Maximum expected speed in m/s for the matching window. |
| `maxOffset` | 60 | Maximum fix distance in metres before marking off-route. |
| `maxStopOffset` | 300 | Maximum point-to-route offset in metres for `distanceTo`. |
| `staleMs` | 30000 | Age in ms after which a fix becomes stale. |
| `lostMs` | 120000 | Age in ms after which a fix becomes lost. |
| `speedAlpha` | 0.4 | Smoothing factor for reported speed. |
| `extrapolateMs` | 5000 | Time in ms to extrapolate at the smoothed speed. |
| `easeMs` | 3000 | Time in ms to ease to a stop after extrapolation. |

Dart takes options as a `TrackerOptions` object. In both languages, omitted
`loop` defaults to whether the route endpoints are within 50 m.

## Non-goals

- **ETA.** It measures distance, not time. Arrival predictions need
  traffic and schedules; that is another library.
- Map matching against a road network, or vehicles on unknown routes.
- Map widgets. Adapters for flutter_map, MapLibre and Leaflet will be
  examples, not part of the core.
- A vehicle switching between several candidate routes (maybe v2).

## Roadmap

| Stage | What | Gate |
|---|---|---|
| 0 | This README and the [design](docs/design.md) | ✅ |
| 1 | Along-route distance with windowed projection, inside Ya Viene's Dart core | Shipped in the Ya Viene app |
| 2 | Shared test vectors in [`vectors/`](vectors/) | Public GTFS-Realtime traces from other cities, plus Ya Viene's once real GPS is installed |
| 3 | Pure-Dart `dart/` package, ported from the TypeScript behavior | All shared vectors pass |
| 4 | TypeScript package with the same behavior | Same vectors pass; < 4 KB gzip |
| 5 | Demo page: raw fixes vs. straight-line animation vs. alongroute | Runs on a low-end phone |
| 6 | 0.1.0 on pub.dev and npm | — |

## Demo

Build the browser module with `cd ts && npm run build:demo`, then serve the
repository root with `python3 -m http.server` and open
<http://localhost:8000/demo/>.

Run the TypeScript benchmark with `cd ts && npm run bench`.

## License

[MIT](LICENSE).
