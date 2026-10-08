# Test vectors

Every implementation (Dart and TypeScript) runs every file in this folder.
A vector is a route, options, and a list of steps; each step feeds a fix or
asks for a reading at a time, and states what it expects.

```json
{
  "name": "out-and-back on the same street, heading decides",
  "route": { "points": [{ "lat": 10.98, "lon": -74.80 }], "loop": true },
  "options": {},
  "steps": [
    { "report": { "lat": 10.98, "lon": -74.80, "t": 0, "heading": 182 },
      "expect": { "progress": [1520, 5], "state": "live" } },
    { "at": 4000, "expect": { "progress": [1560, 5] } }
  ]
}
```

`[value, tolerance]` is in metres. Expected values come from an independent
source — a hand-worked example or a haversine reference — never from the
implementation under test.

No vectors yet: they arrive with stage 2 of the roadmap.
