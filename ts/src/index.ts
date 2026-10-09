export type Point = { lat: number; lon: number };
export type Fix = Point & { t: number; heading?: number; speed?: number; accuracy?: number };
export type Projection = { progress: number; offset: number };
type Segment = { x: number; y: number; dx: number; dy: number; length: number; start: number; heading: number };
const CELL = 100, SEARCH_RADIUS = 300;
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
  // A segment is registered in every 100 m cell touched by its bounding box plus 300 m.
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => `${x},${y}`;
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  segments.forEach((s, i) => {
    const x0 = Math.floor((Math.min(s.x, s.x + s.dx) - SEARCH_RADIUS) / CELL), x1 = Math.floor((Math.max(s.x, s.x + s.dx) + SEARCH_RADIUS) / CELL);
    const y0 = Math.floor((Math.min(s.y, s.y + s.dy) - SEARCH_RADIUS) / CELL), y1 = Math.floor((Math.max(s.y, s.y + s.dy) + SEARCH_RADIUS) / CELL);
    bounds.minX = Math.min(bounds.minX, x0); bounds.maxX = Math.max(bounds.maxX, x1); bounds.minY = Math.min(bounds.minY, y0); bounds.maxY = Math.max(bounds.maxY, y1);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = key(x, y); const cell = grid.get(k); if (cell) cell.push(i); else grid.set(k, [i]); }
  });
  let distanceChecks = 0;
  const projectCandidates = (p: Point) => {
    const q = local(p);
    const cx = Math.floor(q.x / CELL), cy = Math.floor(q.y / CELL), found = new Set<number>(), examined = new Set<number>();
    const outside = cx < bounds.minX || cx > bounds.maxX || cy < bounds.minY || cy > bounds.maxY;
    const maxRing = outside ? 0 : Math.max(cx - bounds.minX, bounds.maxX - cx, cy - bounds.minY, bounds.maxY - cy);
    let best = Infinity;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let x = cx - ring; x <= cx + ring; x++) for (let y = cy - ring; y <= cy + ring; y++) {
        if (ring && x !== cx - ring && x !== cx + ring && y !== cy - ring && y !== cy + ring) continue;
        for (const i of grid.get(key(x, y)) ?? []) found.add(i);
      }
      if (found.size) {
        for (const i of found) if (!examined.has(i)) { examined.add(i); const s = segments[i]!; distanceChecks++; const t = Math.max(0, Math.min(1, ((q.x - s.x) * s.dx + (q.y - s.y) * s.dy) / s.length ** 2)); best = Math.min(best, Math.hypot(q.x - s.x - t * s.dx, q.y - s.y - t * s.dy)); }
        const reach = Math.max(0, (ring - 1) * CELL);
        if (outside || reach > best + 15) break;
      }
      if (ring === maxRing) break;
    }
    const indices = outside || found.size === segments.length ? segments.map((_, i) => i) : [...found].sort((a, b) => a - b);
    return indices.map(i => {
      const s = segments[i]!; distanceChecks++;
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
    _distanceChecks: () => distanceChecks,
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
  private lapBefore = 0;
  private lastFixT?: number;
  private offRoute = false;
  private lap = 0;
  private speed = 0;
  private drawFloor = 0;
  private drawT?: number;
  private drawBase = 0;
  private backwardFrom?: number;
  private backwardFixes = 0;
  readonly route: Route;
  readonly options: { vMax?: number; maxOffset?: number; maxStopOffset?: number; staleMs?: number; lostMs?: number; speedAlpha?: number; extrapolateMs?: number; easeMs?: number };
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
    const drawn = this.at(fix.t);
    const drawnAbsolute = drawn ? drawn.progress + drawn.lap * (this.route.loop ? this.route.length : 0) : 0;
    if (c.offset > (this.options.maxOffset ?? 60)) {
      this.offRoute = true;
      if (drawn) {
        this.current = { ...drawn, state: 'offRoute', offset: c.offset };
        this.drawFloor = this.drawBase = drawnAbsolute;
        this.drawT = fix.t;
        this.speed = 0;
        this.backwardFrom = undefined;
      }
      return copyReading(this.current);
    }
    this.offRoute = false;
    let progress = c.progress;
    let acceptedBackward = false;
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
        else { if (this.route.loop && this.previous.progress < this.route.length / 2 && c.progress > this.route.length / 2) this.lap = Math.max(0, this.lap - 1); this.backwardFixes = 0; acceptedBackward = true; }
      } else {
        if (this.route.loop && c.progress < this.previous.progress && forwardDelta < this.route.length / 2) this.lap++;
        this.backwardFixes = 0;
      }
    }
    const absolute = progress + this.lap * (this.route.loop ? this.route.length : 0);
    if (this.previous && dt > 0) {
      const delta = absolute - (this.previous.progress + this.lapBefore * (this.route.loop ? this.route.length : 0));
      const sample = Math.max(0, delta / dt);
      const alpha = this.options.speedAlpha ?? 0.4;
      this.speed += alpha * (sample - this.speed);
    }
    this.previous = { progress, t: fix.t };
    this.lapBefore = this.lap;
    const at = this.route._at(progress);
    this.current = { progress, lap: this.route.loop ? this.lap : 0, point: at.point, heading: at.heading, state: 'live', offset: c.offset };
    this.backwardFrom = acceptedBackward ? drawnAbsolute : undefined;
    this.drawFloor = acceptedBackward ? absolute : Math.max(drawnAbsolute, absolute);
    this.drawBase = absolute;
    this.drawT = fix.t;
    return copyReading(this.current);
  }
  at(nowMs: number): Reading | null {
    if (!this.current) return null;
    if (this.offRoute) return copyReading({ ...this.current, state: this.state(nowMs) });
    if (this.drawT === undefined) return copyReading({ ...this.current, state: this.state(nowMs) });
    const age = Math.max(0, nowMs - this.drawT), extra = this.options.extrapolateMs ?? 5000, ease = this.options.easeMs ?? 3000;
    if (this.backwardFrom !== undefined) {
      const target = this.drawBase, progressAbs = target + (this.backwardFrom - target) * (1 - Math.min(age / 2000, 1));
      const lap = this.route.loop ? Math.floor(progressAbs / this.route.length) : 0, progress = this.route.loop ? progressAbs % this.route.length : progressAbs;
      const at = this.route._at(progress);
      return copyReading({ progress, lap, point: at.point, heading: at.heading, state: this.state(nowMs), offset: this.current.offset });
    }
    const moving = Math.min(age, extra), easing = Math.min(Math.max(0, age - extra), ease);
    const easeDistance = ease ? easing - easing * easing / (2 * ease) : 0;
    const distance = this.speed * (moving + easeDistance) / 1000;
    let absolute = Math.max(this.drawFloor, this.drawBase + distance);
    if (!this.route.loop) absolute = Math.min(this.route.length, absolute);
    const lap = this.route.loop ? Math.floor(absolute / this.route.length) : 0, progress = this.route.loop ? absolute % this.route.length : absolute;
    const at = this.route._at(progress);
    return copyReading({ progress, lap, point: at.point, heading: at.heading, state: this.state(nowMs), offset: this.current.offset });
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
