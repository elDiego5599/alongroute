import { Tracker, type Reading } from './index.ts';

const fields = ['version', 'previousProgress', 'previousT', 'current', 'lapBefore', 'lastFixT', 'offRoute', 'lap', 'speed', 'drawFloor', 'drawT', 'drawBase', 'backwardFrom', 'backwardCandidate', 'options'] as const;
const optionKeys = ['vMax', 'maxOffset', 'maxStopOffset', 'staleMs', 'lostMs', 'speedAlpha', 'extrapolateMs', 'easeMs'] as const;
const readingKeys = ['progress', 'lap', 'point', 'heading', 'state', 'offset'] as const;
const number = (x: any): boolean => typeof x === 'number' && Number.isFinite(x);
const integer = (x: any): boolean => number(x) && Number.isInteger(x);
const nullable = (x: any): boolean => x === null || number(x);
const plain = (x: any): boolean => !!x && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const exact = (x: any, keys: readonly string[]): boolean => plain(x) && Reflect.ownKeys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k)) && Reflect.ownKeys(x).every(k => typeof k === 'string' && keys.includes(k));
type Shape = { version: 1; previousProgress: number | null; previousT: number | null; current: Reading | null; lapBefore: number; lastFixT: number | null; offRoute: boolean; lap: number; speed: number; drawFloor: number; drawT: number | null; drawBase: number; backwardFrom: number | null; backwardCandidate: number | null; options: Tracker['options'] };
type Route = ReturnType<typeof import('./index.ts').prepareRoute>;
export type TrackerSnapshot = Pick<Shape, typeof fields[number]>;
type State = { previous?: { progress: number; t: number }; current?: Reading };
const copy = (r?: Reading): Reading | null => r ? { ...r, point: { ...r.point } } : null;

export function snapshot(tracker: Tracker): TrackerSnapshot {
  const t = tracker as unknown as State & Record<string, any>;
  return { version: 1, previousProgress: t.previous?.progress ?? null, previousT: t.previous?.t ?? null, current: copy(t.current), lapBefore: (t as any).lapBefore, lastFixT: (t as any).lastFixT ?? null, offRoute: (t as any).offRoute, lap: (t as any).lap, speed: (t as any).speed, drawFloor: (t as any).drawFloor, drawT: (t as any).drawT ?? null, drawBase: (t as any).drawBase, backwardFrom: (t as any).backwardFrom ?? null, backwardCandidate: (t as any).backwardCandidate ?? null, options: { ...tracker.options } };
}

export function restore(route: Route, snap: TrackerSnapshot, options?: Tracker['options']): Tracker {
  const s = snap as any;
  const c = s?.current, o = s?.options;
  if (!exact(s, fields) || s.version !== 1 || !nullable(s.previousProgress) || !nullable(s.previousT) || !integer(s.lapBefore) || !nullable(s.lastFixT) || typeof s.offRoute !== 'boolean' || !integer(s.lap) || !number(s.speed) || !number(s.drawFloor) || !nullable(s.drawT) || !number(s.drawBase) || !nullable(s.backwardFrom) || !nullable(s.backwardCandidate) || !plain(o) || Reflect.ownKeys(o).some(k => typeof k !== 'string' || !optionKeys.includes(k as any)) || Object.values(o).some(v => !number(v)) || (c !== null && (!exact(c, readingKeys) || !number(c.progress) || !integer(c.lap) || !exact(c.point, ['lat', 'lon']) || !number(c.point.lat) || !number(c.point.lon) || !number(c.heading) || !['live', 'stale', 'lost', 'offRoute'].includes(c.state) || !number(c.offset))) || [s.previousProgress, c?.progress, s.backwardCandidate].some(p => p != null && (p < 0 || p > route.length))) throw new Error('Invalid snapshot');
  const { version, previousProgress, previousT, current, options: saved, ...rest } = s, t = new Tracker(route, options ?? saved) as any;
  for (const k in rest) (t as any)[k] = rest[k] ?? undefined;
  t.previous = previousProgress == null || previousT == null ? undefined : { progress: previousProgress, t: previousT };
  t.current = copy(current ?? undefined) ?? undefined;
  return t;
}
