import 'dart:convert';
import 'dart:io';

import 'package:alongroute/alongroute.dart';
import 'package:test/test.dart';

void main() {
  final vectorFiles = Directory('../vectors')
      .listSync()
      .whereType<File>()
      .where((file) => file.path.endsWith('.json'))
      .toList()
    ..sort((a, b) => a.path.compareTo(b.path));
  for (final file in vectorFiles) {
    final vector = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    test(vector['name'] as String, () {
      final routeData = vector['route'] as Map<String, dynamic>;
      final points = (routeData['points'] as List)
          .map(
            (p) => Point(
              lat: (p['lat'] as num).toDouble(),
              lon: (p['lon'] as num).toDouble(),
            ),
          )
          .toList();
      final optionsData = vector['options'] as Map<String, dynamic>? ?? {};
      double option(String key, double defaultValue) =>
          (optionsData[key] as num?)?.toDouble() ?? defaultValue;
      final tracker = Tracker(
        prepareRoute(points, loop: routeData['loop'] as bool?),
        options: TrackerOptions(
          vMax: option('vMax', 25),
          maxOffset: option('maxOffset', 60),
          maxStopOffset: option('maxStopOffset', 300),
          staleMs: option('staleMs', 30000),
          lostMs: option('lostMs', 120000),
          speedAlpha: option('speedAlpha', 0.4),
          extrapolateMs: option('extrapolateMs', 5000),
          easeMs: option('easeMs', 3000),
        ),
      );
      final steps = vector['steps'] as List<dynamic>;
      for (var index = 0; index < steps.length; index++) {
        final step = steps[index] as Map<String, dynamic>;
        final expectData = step['expect'] as Map<String, dynamic>? ?? {};
        final why =
            '${file.uri.pathSegments.last}, step $index: ${step['why']}';
        try {
          if (step['report'] != null) {
            final data = step['report'] as Map<String, dynamic>;
            final actual = tracker.report(
              Fix(
                lat: (data['lat'] as num).toDouble(),
                lon: (data['lon'] as num).toDouble(),
                t: (data['t'] as num).toDouble(),
                heading: (data['heading'] as num?)?.toDouble(),
                speed: (data['speed'] as num?)?.toDouble(),
                accuracy: (data['accuracy'] as num?)?.toDouble(),
              ),
            );
            if (expectData['state'] != null && step['stateAt'] == null) {
              expect(actual?.state.name, expectData['state'], reason: why);
            }
            if (expectData['lap'] != null) {
              expect(actual?.lap, expectData['lap'], reason: why);
            }
            _expectHeading(actual, expectData, why);
            _expectProgress(actual, expectData, why);
          }
          if (step['at'] != null) {
            final actual = tracker.at((step['at'] as num).toDouble());
            if (expectData['state'] != null) {
              expect(actual?.state.name, expectData['state'], reason: why);
            }
            if (expectData['lap'] != null) {
              expect(actual?.lap, expectData['lap'], reason: why);
            }
            _expectHeading(actual, expectData, why);
            _expectProgress(actual, expectData, why);
          }
          if (step['stateAt'] != null) {
            final reportTime =
                (step['report'] as Map<String, dynamic>)['t'] as num;
            expect(
              tracker
                  .state(reportTime + (step['stateAt'] as num).toDouble())
                  .name,
              expectData['state'],
              reason: why,
            );
          }
          if (step['distanceTo'] != null) {
            final data = step['distanceTo'] as Map<String, dynamic>;
            final actual = tracker.distanceTo(
              Point(
                lat: (data['lat'] as num).toDouble(),
                lon: (data['lon'] as num).toDouble(),
              ),
            );
            final expected = expectData['distance'];
            if (expected == null) {
              expect(actual, isNull, reason: why);
            } else {
              final pair = expected as List;
              expect(actual, isNotNull, reason: why);
              expect(
                (actual! - (pair[0] as num).toDouble()).abs(),
                lessThanOrEqualTo((pair[1] as num).toDouble()),
                reason: why,
              );
            }
          }
        } catch (error) {
          fail('$why\n$error');
        }
      }
    });
  }
}

void _expectHeading(
  Reading? actual,
  Map<String, dynamic> expected,
  String reason,
) {
  if (expected['heading'] == null) return;
  final pair = expected['heading'] as List;
  final target = (pair[0] as num).toDouble();
  final tolerance = (pair[1] as num).toDouble();
  final value = actual?.heading;
  expect(value, isNotNull, reason: reason);
  final delta = ((value! - target + 540) % 360) - 180;
  expect(delta.abs(), lessThanOrEqualTo(tolerance), reason: reason);
}

void _expectProgress(
  Reading? actual,
  Map<String, dynamic> expected,
  String reason,
) {
  if (expected['progress'] == null) return;
  final pair = expected['progress'] as List;
  expect(actual, isNotNull, reason: reason);
  expect(
    (actual!.progress - (pair[0] as num).toDouble()).abs(),
    lessThanOrEqualTo((pair[1] as num).toDouble()),
    reason: reason,
  );
}
