# Test vectors

Every implementation (Dart and TypeScript) runs every file in this folder.
A vector has a route, options, and ordered steps. A `report` step feeds a
GPS fix to the tracker. A `distanceTo` step asks for the route
distance from the tracker's current position to a point.

```json
{
  "name": "straight open route, point ahead",
  "route": { "points": [{ "lat": 0, "lon": 0 }, { "lat": 0, "lon": 0.0089831 }], "loop": false },
  "options": {},
  "steps": [
    { "report": { "lat": 0, "lon": 0.0017966, "t": 0, "heading": 90 },
      "why": "Fix is 200 m along the eastbound route." },
    { "distanceTo": { "lat": 0, "lon": 0.0062882 },
      "expect": { "distance": [500, 1] },
      "why": "700 m point − 200 m vehicle = 500 m forward." }
  ]
}
```

Routes and points use latitude/longitude. Examples use the equator, where
`0.0000089831°` is 1 m on a sphere of radius 6 378 137 m (WGS 84
equatorial). With a 6 371 km radius the same degrees are 0.11 % shorter,
well inside the tolerances used. A `report` has `lat`, `lon`,
`t` (milliseconds), and optional `heading` (degrees clockwise from north).
`distanceTo` takes the target point directly. A numeric expectation is
`[metres, tolerance]`; use `null` for no result. Every step has a `why` string
with its hand-worked reasoning. Expected values must come from hand
arithmetic or an independent reference, never the implementation under test.

A `report` step may include `expect: { "progress": [metres, tolerance] }` to
check the progress returned by that fix. This is useful for vectors that check
how the tracker handles noisy or backward fixes.

Reading vectors can also check `expect.lap` (an integer), `expect.heading`
(`[degrees, tolerance]`, clockwise from north), and `expect.state` (one of
`live`, `stale`, `lost`, or `offRoute`). `stateAt` on a step checks
`tracker.state(report.t + stateAt)`, where `stateAt` is a millisecond offset
from that step's report time. Lap is zero on open routes and counts completed
forward wraps on loop routes. An off-route report retains the last valid
progress, lap, and route point while changing the Reading state to `offRoute`;
before any valid report it returns null.

Every vector's `why` explains the expected arithmetic by hand. Expected values
must come from hand arithmetic or an independent reference, never the
implementation under test.

`options` is the tracker options object (empty for these vectors).
