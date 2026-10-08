# alongroute — design

Draft, 2026-10-08. Everything here is a starting point to be confirmed by
tests and real traces; numbers marked "default" are options.

## 1. Model

```ts
type Point = { lat: number; lon: number };

type Route = {
  points: Point[];   // ≥ 2, in driving order
  loop?: boolean;    // the route starts over at the end; default: inferred
                     // when start and end are < 50 m apart
};

type Fix = {
  lat: number; lon: number;
  t: number;          // epoch ms from the GPS, not arrival time
  heading?: number;   // degrees
  speed?: number;     // m/s
  accuracy?: number;  // m
};

type State = 'live' | 'stale' | 'lost' | 'offRoute';

type Reading = {
  progress: number;  // metres from the route start, [0, length)
  lap: number;       // completed laps on a loop route
  point: Point;      // position on the route
  heading: number;   // route tangent there
  state: State;
  offset: number;    // metres from the last fix to the route
};
```

`Tracker` serialises to and from JSON so a server and a phone can share
state.

## 2. Projection with a window

1. **First fix, or after `offRoute`:** global search through a grid index
   of ~200 m cells; the segment with the smallest offset wins. If two
   candidates are within 15 m of each other, the fix's heading decides
   against each segment's direction. Without heading, the reading stays
   `pending` and the second fix decides.
2. **Later fixes:** only segments inside
   `[progress − 50 m, progress + vMax·Δt + 100 m]` are searched (wrapping
   on loops). `vMax` default: 25 m/s (90 km/h).
3. **Off route:** if the best segment in the window is more than
   `maxOffset` (default 60 m) away for `offRouteFixes` (default 3) fixes in
   a row, the state becomes `offRoute` and the next search is global again.

A test counts the segments visited: a windowed `report` must not walk the
whole route.

## 3. Forward-only progress

- A backward move smaller than `backTolerance` (default 30 m) is noise: the
  progress stays.
- A larger backward move confirmed by 2 fixes is accepted (the bus really
  reversed, or the earlier fix was bad), with a smooth transition.
- On a loop, going from the end to the start adds a lap; it is not a
  backward move.

Property test: for any sequence of fixes on the route with ±25 m noise,
`progress + lap·length` never drops by more than `backTolerance`.

## 4. Between fixes

- Speed along the route = Δprogress / Δt of the last two fixes, smoothed
  with an exponential moving average (default α = 0.4).
- `at(now)` advances at that speed for up to `maxExtrapolation` (default
  8 s), then eases to a stop. It never goes further than `vMax·Δt` from the
  last fix.
- A fix that lands behind the drawn position does not pull it back: the
  drawing waits until the real position catches up.
- The position is interpolated **on the polyline**, so it turns corners.

## 5. Freshness states

| State | When | Default |
|---|---|---|
| `live` | last fix younger than `staleMs` | 45 s |
| `stale` | between `staleMs` and `lostMs` | 45 s – 5 min |
| `lost` | older than `lostMs` | > 5 min |
| `offRoute` | see §2.3 | 3 fixes > 60 m away |

Every default is an option, and its value is justified in the docs next to
it.

## 6. Distance along the route

`distanceTo(p)` projects `p` onto the route. If `p` is more than
`maxStopOffset` (default 300 m) from the route, it returns `null`.
Otherwise the distance is the stretch of route between the vehicle and
`p`. On a loop, a point already passed is one lap minus what has been
driven; on an open route it is `null` ("passed").

## 7. Geometry

Local equirectangular coordinates per route, centred on the route: error
under 0.1 % at city scale. Haversine is only the reference in tests.

## 8. Shared test vectors

See [`vectors/README.md`](../vectors/README.md). Minimum cases:

- straight line, L-turn, sharp corner;
- out-and-back on the same street, with and without heading;
- loop wrap (end → start);
- ±25 m noise while parked (progress moves < 5 m);
- duplicated fix, out-of-order fix, fix from the future;
- 2-minute gap (`stale`) and 10-minute gap (`lost`);
- 300 m detour for road works, then rejoining;
- degenerate route (repeated points, a single point);
- real traces: public GTFS-Realtime feeds, and Ya Viene's own once real GPS
  is installed (no plate, no operator, time shifted to 0).

## 9. Performance

What CI can check, not a specific phone:

- windowed `report` visits only the window's segments (counted in a test);
- a benchmark baseline; a change that is > 10 % slower on the same CI
  machine fails;
- TypeScript build: < 4 KB gzip, ESM, no dependencies,
  `sideEffects: false`.

## 10. Open questions

1. Licence stays MIT, or Apache-2.0 for the patent grant?
2. Should the server be able to send `progress` directly (phones stop
   projecting), as an optional v2 transport?
