import 'dart:convert';
import 'dart:io';
import 'package:alongroute/alongroute.dart';
import 'package:test/test.dart';

void main() {
  Route route() => prepareRoute(const [Point(lat: 0, lon: 0), Point(lat: 0, lon: 0.02)], loop: false);
  test('JSON round trip and shared TypeScript fixture', () {
    final r = route();
    final fixture = jsonDecode(File('../fixtures/snapshot.json').readAsStringSync()) as Map<String, Object?>;
    final reading = restore(r, fixture).at(6000)!;
    expect(reading.progress, 500);
    expect(reading.heading, 90);
    final tracker = Tracker(r)..report(const Fix(lat: 0, lon: 0.001, t: 1));
    final copy = restore(r, jsonDecode(jsonEncode(snapshot(tracker))) as Map<String, Object?>);
    expect(copy.at(100)!.progress, tracker.at(100)!.progress);
  });
  test('rejects invalid version, numbers, and progress', () {
    final r = route(), base = snapshot(Tracker(r));
    final point = {'lat': 0.0, 'lon': 0.0};
    final reading = <String, Object?>{'progress': 0.0, 'lap': 0, 'point': point,
      'heading': 0.0, 'state': 'live', 'offset': 0.0};
    final badSnapshots = <Object?>[
      {...base, 'version': 2}, {...base, 'speed': double.infinity},
      {...base, 'previousProgress': r.length + 1}, {...base, 'speed': '5'},
      {...base, 'offRoute': 'yes'}, {...base, 'lap': 1.5},
      {...base, 'current': {...reading, 'state': 'flying'}},
      {...base, 'current': {'lap': 0, 'point': point, 'heading': 0.0, 'state': 'live', 'offset': 0.0}},
      {...base, 'current': {...reading, 'extra': 1}},
      {...base, 'current': {...reading, 'point': {'lat': 0.0}}},
      {...base, 'current': {...reading, 'point': {'lat': 0.0, 'lon': 0.0, 'extra': 1}}},
      {...base, 'current': {...reading, 'point': []}},
      {...base, 'options': 'x'}, {...base, 'options': []},
      {...base, 'options': {'vMax': 1, 'extra': 2}},
    ];
    for (final bad in badSnapshots) {
      expect(() => restore(r, bad), throwsArgumentError);
    }
    expect(() => restore(r, {...base, 'route': {}}), throwsArgumentError);
    expect(() => restore(r, 'not a map'), throwsArgumentError);
  });
}
