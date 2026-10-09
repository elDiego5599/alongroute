export type Point = { lat: number; lon: number };
export type Fix = Point & { t: number; heading?: number; speed?: number; accuracy?: number };
export type Projection = { progress: number; offset: number };
type Segment = { x: number; y: number; dx: number; dy: number; length: number; start: number; heading: number };
const R = 6378137, rad = Math.PI / 180;
const haversine = (a: Point, b: Point) => {
  const p1 = a.lat * rad, p2 = b.lat * rad, dp = (b.lat - a.lat) * rad, dl = (b.lon - a.lon) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const angleDiff = (a: number, b: number) => { const d = Math.abs((a - b) % 360); return Math.min(d, 360 - d); };

export function prepareRoute(points: Point[], options: { loop?: boolean } = {}) {
  if (points.length < 2) throw new Error("Route must contain at least two points");
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon0 = points.reduce((s, p) => s + p.lon, 0) / points.length;
  const kx = R * Math.cos(lat0 * rad), xy = points.map(p => ({ x: (p.lon - lon0) * rad * kx, y: (p.lat - lat0) * rad * R }));
  const close = Math.hypot(xy.at(-1)!.x - xy[0].x, xy.at(-1)!.y - xy[0].y);
  const loop = options.loop ?? close < 50;
  if (loop && close > 0) xy.push({ ...xy[0] });
  const segments: Segment[] = []; let length = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i]!, b = xy[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (!len) continue;
    segments.push({ x: a.x, y: a.y, dx, dy, length: len, start: length, heading: (Math.atan2(dx, dy) / rad + 360) % 360 }); length += len;
  }
  if (!length) throw new Error("Route must contain at least one non-zero-length segment");
  const local = (p: Point) => ({ x: (p.lon - lon0) * rad * kx, y: (p.lat - lat0) * rad * R });
  const projectCandidates = (p: Point) => {
    const q = local(p);
    return segments.map(s => {
      const t = Math.max(0, Math.min(1, ((q.x - s.x) * s.dx + (q.y - s.y) * s.dy) / s.length ** 2));
      return { progress: s.start + t * s.length, offset: Math.hypot(q.x - s.x - t * s.dx, q.y - s.y - t * s.dy), heading: s.heading };
    });
  };
  const choose = (cs: ReturnType<typeof projectCandidates>, heading?: number) => {
    const nearest = Math.min(...cs.map(c => c.offset));
    return cs.filter(c => c.offset <= nearest + 15).sort((a, b) => (heading === undefined ? 0 : angleDiff(a.heading, heading) - angleDiff(b.heading, heading)) || a.offset - b.offset)[0]!;
  };
  return {
    points, loop, length,
    project(point: Point): Projection { const c = choose(projectCandidates(point)); return { progress: c.progress, offset: c.offset }; },
    _local: local, _candidates: projectCandidates, _choose: choose,
    _at(progress: number): { point: Point; heading: number } {
      const p = loop ? ((progress % length) + length) % length : Math.max(0, Math.min(length, progress));
      const s = segments.find(x => p <= x.start + x.length) ?? segments.at(-1)!;
      const t = Math.max(0, Math.min(1, (p - s.start) / s.length));
      return { point: { lat: (s.y + t * s.dy) / (R * rad) + lat0, lon: (s.x + t * s.dx) / (R * Math.cos(lat0 * rad) * rad) + lon0 }, heading: s.heading };
    },
    _segments: segments
  };
}

type Route = ReturnType<typeof prepareRoute>;
export type Reading = { progress: number; lap: number; point: Point; heading: number; state: 'live' | 'stale' | 'lost' | 'offRoute'; offset: number };
export type TrackerState = Reading['state'];
const copyReading = (reading: Reading | undefined): Reading | null => reading ? { ...reading, point: { ...reading.point } } : null;
export class Tracker {
  private previous?: { progress: number; t: number };
  private current?: Reading;
  private lastFixT?: number;
  private offRoute = false;
  private lap = 0;
  private backwardFixes = 0;
  readonly route: Route;
  readonly options: { vMax?: number; maxOffset?: number; maxStopOffset?: number; staleMs?: number; lostMs?: number };
  constructor(route: Route, options: Tracker["options"] = {}) { this.route = route; this.options = options; }
  state(nowMs: number): TrackerState {
    if (this.offRoute) return 'offRoute';
    if (this.lastFixT === undefined) return 'lost';
    const age = Math.max(0, nowMs - this.lastFixT);
    if (age <= (this.options.staleMs ?? 30000)) return 'live';
    return age <= (this.options.lostMs ?? 120000) ? 'stale' : 'lost';
  }
  report(fix: Fix): Reading | null {
    if (this.previous && fix.t <= this.previous.t) return copyReading(this.current);
    this.lastFixT = fix.t;
    const dt = this.previous ? (fix.t - this.previous.t) / 1000 : 0;
    const low = this.previous ? this.previous.progress - 50 : 0;
    const high = this.previous ? this.previous.progress + (this.options.vMax ?? 25) * dt + 100 : this.route.length;
    const candidates = this.route._candidates(fix);
    const inWindow = candidates.map((c, i) => ({ ...c, i })).filter(c => {
      if (high - low >= this.route.length) return true;
      return this.route.loop ? ((c.progress - low) % this.route.length + this.route.length) % this.route.length <= high - low : c.progress >= Math.max(0, low) && c.progress <= Math.min(this.route.length, high);
    });
    let c = this.route._choose(inWindow.length ? inWindow : candidates, fix.heading);
    if (c.offset > (this.options.maxOffset ?? 60)) {
      this.offRoute = true;
      if (this.current) this.current = { ...this.current, state: 'offRoute', offset: c.offset };
      return copyReading(this.current);
    }
    this.offRoute = false;
    let progress = c.progress;
    if (this.previous) {
      const rawDelta = progress - this.previous.progress;
      const forwardDelta = this.route.loop ? (rawDelta % this.route.length + this.route.length) % this.route.length : rawDelta;
      const isBackward = this.route.loop ? forwardDelta > this.route.length / 2 : rawDelta < 0;
      const distanceBehind = this.route.loop ? this.route.length - forwardDelta : -rawDelta;
      if (isBackward && distanceBehind <= 30) {
        progress = this.previous.progress;
        this.backwardFixes = 0;
      } else if (isBackward) {
        this.backwardFixes++;
        if (this.backwardFixes < 2) progress = this.previous.progress;
        else { if (this.route.loop && this.previous.progress < this.route.length / 2 && c.progress > this.route.length / 2) this.lap = Math.max(0, this.lap - 1); this.backwardFixes = 0; }
      } else {
        if (this.route.loop && c.progress < this.previous.progress && forwardDelta < this.route.length / 2) this.lap++;
        this.backwardFixes = 0;
      }
    }
    this.previous = { progress, t: fix.t };
    const at = this.route._at(progress);
    this.current = { progress, lap: this.route.loop ? this.lap : 0, point: at.point, heading: at.heading, state: 'live', offset: c.offset };
    return copyReading(this.current);
  }
  distanceTo(point: Point): number | null {
    if (!this.current || this.offRoute || this.current.offset > 60) return null;
    const candidates = this.route._candidates(point), nearest = Math.min(...candidates.map(c => c.offset));
    if (nearest > (this.options.maxStopOffset ?? 300)) return null;
    const passes = candidates.filter(c => c.offset <= nearest + 15);
    let distance = Infinity;
    for (const c of passes) {
      let d = c.progress - this.current.progress;
      if (this.route.loop) { d = (d % this.route.length + this.route.length) % this.route.length; if (this.route.length - d < 30) d = 0; }
      else if (d < 0) { if (d > -30) d = 0; else continue; }
      distance = Math.min(distance, d + c.offset);
    }
    return Number.isFinite(distance) ? distance : null;
  }
}
