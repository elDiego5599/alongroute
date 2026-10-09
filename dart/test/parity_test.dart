import 'dart:convert';
import 'dart:io';
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

double rounded(double value) {
  final result = (value * 1e6).round() / 1e6;
  return result == 0 ? 0.0 : result;
}

Map<String, Object?>? snapshot(Reading? reading) {
  if (reading == null) return null;
  return {
    'progress': rounded(reading.progress),
    'lap': reading.lap,
    'point': {'lat': rounded(reading.point.lat), 'lon': rounded(reading.point.lon)},
    'heading': rounded(reading.heading),
    'state': reading.state.name,
    'offset': rounded(reading.offset),
  };
}

List<Map<String, Object?>> replay() {
  final scenarios = <Map<String, Object?>>[];
  for (var scenario = 0; scenario < 20; scenario++) {
    final seed = (seed0 + scenario) & 0xffffffff;
    final random = Rng(seed);
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
    final tracker = Tracker(route, options: const TrackerOptions(vMax: 20));
    var time = 0.0, distance = 0.0, reverseLeft = 0;
    final readings = <Map<String, Object?>>[];
    for (var i = 0; i < 10; i++) {
      final speed = random.between(3, 20);
      final gap = i > 0 && random.next() < 0.2
          ? random.between(10000, 200000)
          : random.between(1000, 5000);
      time += gap;
      distance = math.min(route.length - 1, distance + speed * gap / 1000);
      if (reverseLeft == 0 && random.next() < 0.15) reverseLeft = 2;
      if (reverseLeft > 0) {
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
        fix = Point(lat: fix.lat + random.between(100, 500) / 111319, lon: fix.lon);
      }
      readings.add({'kind': 'report', 't': time, 'reading': snapshot(tracker.report(
        Fix(lat: fix.lat, lon: fix.lon, t: time),
      ))});
      for (final offset in [6000]) {
        final now = time + offset;
        readings.add({'kind': 'at', 't': now, 'reading': snapshot(tracker.at(now))});
      }
    }
    scenarios.add({'scenario': scenario, 'seed': seed, 'readings': readings});
  }
  return scenarios;
}

void main() {
  test('seeded Dart traces match TypeScript parity golden', () {
    final golden = jsonDecode(File('../parity/parity-traces.json').readAsStringSync())
        as Map<String, dynamic>;
    final expectedScenarios = golden['scenarios'] as List<dynamic>;
    final actualScenarios = replay();
    expect(actualScenarios.length, expectedScenarios.length);
    for (var s = 0; s < actualScenarios.length; s++) {
      final actual = actualScenarios[s];
      final expected = expectedScenarios[s] as Map<String, dynamic>;
      expect(actual['scenario'], expected['scenario']);
      expect(actual['seed'], expected['seed']);
      final actualReadings = actual['readings'] as List<Map<String, Object?>>;
      final expectedReadings = expected['readings'] as List<dynamic>;
      expect(actualReadings.length, expectedReadings.length);
      for (var i = 0; i < actualReadings.length; i++) {
        final got = actualReadings[i];
        final want = expectedReadings[i] as Map<String, dynamic>;
        expect(got['kind'], want['kind'], reason: 'scenario $s reading $i');
        expect(got['t'], closeTo((want['t'] as num).toDouble(), 1e-6));
        final actualReading = got['reading'] as Map<String, Object?>?;
        final expectedReading = want['reading'] as Map<String, dynamic>?;
        if (expectedReading == null) {
          expect(actualReading, isNull, reason: 'scenario $s reading $i');
          continue;
        }
        expect(actualReading, isNotNull, reason: 'scenario $s reading $i');
        final a = actualReading!;
        expect(a['lap'], expectedReading['lap'], reason: 'scenario $s reading $i');
        expect(a['state'], expectedReading['state'], reason: 'scenario $s reading $i');
        for (final key in ['progress', 'heading', 'offset']) {
          expect((a[key] as num).toDouble(),
              closeTo((expectedReading[key] as num).toDouble(), 1e-6),
              reason: 'scenario $s reading $i $key');
        }
        final point = a['point'] as Map<String, Object?>;
        final expectedPoint = expectedReading['point'] as Map<String, dynamic>;
        for (final key in ['lat', 'lon']) {
          expect((point[key] as num).toDouble(),
              closeTo((expectedPoint[key] as num).toDouble(), 1e-6),
              reason: 'scenario $s reading $i point.$key');
        }
      }
    }
  });
}
