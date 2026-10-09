import 'dart:convert';
import 'dart:math' as math;

import 'package:alongroute/alongroute.dart';
import 'package:test/test.dart';

const seed0 = 0x51a7e;

class Rng {
  Rng(int seed) : x = seed;
  int x;

  double next() {
    x = (x ^ ((x << 13) & 0xffffffff)) & 0xffffffff;
    x = (x ^ (x >> 17)) & 0xffffffff;
    x = (x ^ ((x << 5) & 0xffffffff)) & 0xffffffff;
    return x / 4294967296;
  }
  double between(double a, double b) => a + next() * (b - a);
}

Point along(List<Point> points, double distance) {
  var left = distance;
  for (var i = 1; i < points.length; i++) {
    final a = points[i - 1], b = points[i];
    final dx = (b.lon - a.lon) * 111319, dy = (b.lat - a.lat) * 111319;
    final length = math.sqrt(dx * dx + dy * dy);
    if (left <= length || i == points.length - 1) {
      final f = math.min(1, left / length);
      return Point(lat: a.lat + dy * f / 111319, lon: a.lon + dx * f / 111319);
    }
    left -= length;
  }
  return points.last;
}

void main() {
  test('windowed matching keeps a nearby fix on its progress branch', () {
    final route = prepareRoute([
      const Point(lat: 0, lon: 0),
      const Point(lat: 0, lon: 0.018),
      const Point(lat: 0.01, lon: 0.018),
      const Point(lat: 0.01, lon: 0.00988),
      const Point(lat: 0.00027, lon: 0.00988),
    ], loop: false);
    final tracker = Tracker(route, options: const TrackerOptions(vMax: 25));
    final first = tracker.report(const Fix(lat: 0, lon: 0.00988, t: 1000));
    final next = tracker.report(const Fix(lat: 0.00027, lon: 0.00988, t: 2000));
    expect(first, isNotNull);
    expect(next, isNotNull);
    final firstReading = first!, nextReading = next!;
    expect((firstReading.progress - 1100).abs(), lessThan(2));
    expect((nextReading.progress - firstReading.progress).abs(), lessThan(100));
  });
  test('at caps extrapolation speed at vMax', () {
    final route = prepareRoute([
      const Point(lat: 0, lon: 0),
      const Point(lat: 0, lon: 0.02),
    ], loop: false);
    final tracker = Tracker(route, options: const TrackerOptions(vMax: 20));
    tracker.report(const Fix(lat: 0, lon: 0, t: 1000));
    final second = tracker.report(Fix(
      lat: 0,
      lon: 100 / (6378137 * math.pi / 180),
      t: 2000,
    ));
    expect(second, isNotNull);
    final frame = tracker.at(3000)!;
    expect(frame.progress - second!.progress, lessThanOrEqualTo(20.01));
  });
  test('seeded Tracker invariants', () {
    for (var scenario = 0; scenario < 200; scenario++) {
      final seed = (seed0 + scenario) & 0xffffffff;
      final random = Rng(seed);
      try {
        final loop = random.next() < 0.5;
        final count = 5 + (random.next() * 196).floor();
        final points = <Point>[const Point(lat: 0, lon: 0)];
        for (var i = 1; i < count; i++) {
          final angle = random.between(0, math.pi * 2);
          final distance = random.between(80, 220);
          final previous = points.last;
          points.add(Point(
            lat: previous.lat + math.sin(angle) * distance / 111319,
            lon: previous.lon + math.cos(angle) * distance / 111319,
          ));
        }
        final route = prepareRoute(points, loop: loop);
        const vMax = 20.0;
        final tracker = Tracker(
          route,
          options: const TrackerOptions(vMax: vMax),
        );
        Tracker? resumed;
        var time = 0.0, distance = 0.0;
        var reverseLeft = 0;
        ({double absolute, double time, bool held})? lastReport;
        ({double absolute, double time})? lastFrame;
        void invalidateHeld() {
          final previous = lastReport;
          if (previous == null) {
            return;
          }
          lastReport = (
            absolute: previous.absolute,
            time: previous.time,
            held: false,
          );
        }

        for (var i = 0; i < 10; i++) {
          final speed = random.between(3, 20);
          final gap = i > 0 && random.next() < 0.2
              ? random.between(10000, 200000)
              : random.between(1000, 5000);
          time += gap;
          distance = math.min(route.length - 1, distance + speed * gap / 1000);
          if (reverseLeft == 0 && random.next() < 0.15) {
            reverseLeft = 2;
          }
          final reversing = reverseLeft > 0;
          if (reversing) {
            distance = math.max(0, distance - random.between(45, 80));
            reverseLeft--;
          }
          final base = along(points, distance);
          final angle = random.between(0, math.pi * 2);
          final noise = random.between(0, 25) / 111319;
          var fix = Point(
            lat: base.lat + math.sin(angle) * noise,
            lon: base.lon + math.cos(angle) * noise,
          );
          if (random.next() < 0.12) {
            fix = Point(
              lat: fix.lat + random.between(100, 500) / 111319,
              lon: fix.lon,
            );
          }
          final reading = tracker.report(Fix(
            lat: fix.lat,
            lon: fix.lon,
            t: time,
          ));
          if (resumed != null) {
            final copy = resumed.report(Fix(lat: fix.lat, lon: fix.lon, t: time));
            expect(copy?.progress, reading?.progress);
            expect(copy?.lap, reading?.lap);
            expect(copy?.point.lat, reading?.point.lat);
            expect(copy?.point.lon, reading?.point.lon);
            expect(copy?.heading, reading?.heading);
            expect(copy?.state, reading?.state);
            expect(copy?.offset, reading?.offset);
          }
          if (i == 4) {
            resumed = restore(route,
                jsonDecode(jsonEncode(snapshot(tracker))) as Map<String, Object?>);
          }
          if (reading == null) {
            invalidateHeld();
          } else {
            final absolute =
                reading.progress + reading.lap * (loop ? route.length : 0);
            if (reading.state == TrackerState.offRoute) {
              invalidateHeld();
            } else {
              final previousReport = lastReport;
              if (previousReport != null) {
                final dt = time - previousReport.time;
                final limit = previousReport.absolute +
                    vMax * dt / 1000 + 100.01;
                expect(
                  absolute,
                  lessThanOrEqualTo(limit),
                  reason: 'report window invariant: '
                      '${previousReport.absolute} -> $absolute '
                      'over ${time - previousReport.time} ms',
                );
                if (absolute < previousReport.absolute - 0.01) {
                  final backwardLimit = vMax * dt / 1000 + 100;
                  expect(
                    previousReport.held &&
                        previousReport.absolute - absolute <= backwardLimit,
                    isTrue,
                    reason: 'progress invariant: '
                        '${previousReport.absolute} -> $absolute; '
                        'previous report held=${previousReport.held}; '
                        'drop limit=$backwardLimit; dt=$dt ms',
                  );
                }
              }
              final held = previousReport != null &&
                  (absolute - previousReport.absolute).abs() <= 0.01;
              lastReport = (absolute: absolute, time: time, held: held);
            }
            check(reading, route, loop);
            expect(identical(reading, tracker.at(time)), isFalse,
                reason: 'report copy invariant: same Reading returned');
            expect(identical(reading.point, tracker.at(time)!.point), isFalse,
                reason: 'report copy invariant: same Point returned');
          }
          final atReport = tracker.at(time);
          if (resumed != null) expect(resumed.at(time)?.progress, atReport?.progress);
          if (atReport != null) {
            lastFrame = (
              absolute: atReport.progress + atReport.lap * route.length,
              time: time,
            );
          }
          final stale = tracker.state(time + 45001);
          final lost = tracker.state(time + 300001);
          if (stale != TrackerState.offRoute) {
            expect(stale, TrackerState.stale);
          }
          if (lost != TrackerState.offRoute) {
            expect(lost, TrackerState.lost);
          }
          for (final now in [time + 500, time + 6000, time + 9500]) {
            final at = tracker.at(now);
            if (at == null) {
              continue;
            }
            check(at, route, loop);
            expect(at.state, tracker.state(now));
            if (at.state != TrackerState.offRoute) {
              expect(at.state, now - time <= 45000
                  ? TrackerState.live
                  : now - time <= 300000
                      ? TrackerState.stale
                      : TrackerState.lost);
            }
            if (!loop) {
              expect(at.progress, lessThanOrEqualTo(route.length + 1e-6));
            }
            final absolute = at.progress + at.lap * route.length;
            if (lastFrame != null && now > lastFrame.time) {
              final limit = vMax * (now - lastFrame.time) / 1000 + 100.01;
              expect(absolute, lessThanOrEqualTo(lastFrame.absolute + limit),
                  reason: 'frame bound: ${lastFrame.absolute} -> $absolute; '
                      'dt=${now - lastFrame.time}; limit=$limit');
            }
            lastFrame = (absolute: absolute, time: now);
            expect(identical(at, tracker.at(now)), isFalse);
            expect(identical(at.point, tracker.at(now)!.point), isFalse);
          }
        }
      } catch (error) {
        fail('seed=$seed scenario=$scenario: $error');
      }
    }
  });
}
void check(Reading reading, Route route, bool loop) {
  expect(reading.progress, greaterThanOrEqualTo(0));
  expect(reading.progress, lessThan(loop ? route.length : route.length + 1e-7));
  if (!loop) {
    expect(reading.lap, 0);
  }
  expect(route.project(reading.point).offset, lessThan(0.5));
}
