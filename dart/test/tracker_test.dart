import 'package:alongroute/alongroute.dart';
import 'package:test/test.dart';

void main() {
  const s = 0.0044916;
  Route square() => prepareRoute([
    const Point(lat: 0, lon: 0),
    const Point(lat: 0, lon: s),
    const Point(lat: s, lon: s),
    const Point(lat: s, lon: 0),
    const Point(lat: 0, lon: 0),
  ], loop: true);
  const corners = [
    Point(lat: 0, lon: s / 2),
    Point(lat: s / 2, lon: s),
    Point(lat: s, lon: s / 2),
    Point(lat: s / 2, lon: 0),
  ];
  const headings = [90.0, 0.0, 270.0, 180.0];

  test('a vehicle on its third lap still measures forward, not backward', () {
    final tracker = Tracker(
      square(),
      options: const TrackerOptions(vMax: 1000),
    );
    var t = 0.0;
    for (var lap = 0; lap < 3; lap++) {
      for (var i = 0; i < 4; i++) {
        t += 1000;
        tracker.report(
          Fix(
            lat: corners[i].lat,
            lon: corners[i].lon,
            t: t,
            heading: headings[i],
          ),
        );
      }
    }
    final distance = tracker.distanceTo(const Point(lat: 0, lon: s / 2));
    expect(distance, isNotNull);
    expect((distance! - 500).abs(), lessThan(2));
    t += 1000;
    expect(
      tracker.report(const Fix(lat: 0, lon: s / 2, t: 13000, heading: 90)),
      isNotNull,
    );
  });

  test('returned readings are immutable copies', () {
    final tracker = Tracker(
      prepareRoute([
        const Point(lat: 0, lon: 0),
        const Point(lat: 0, lon: 0.0089831),
      ], loop: false),
    );
    final valid = tracker.report(
      const Fix(lat: 0, lon: 0.0017966, t: 1000, heading: 90),
    )!;
    final offRoute = tracker.report(
      const Fix(lat: 0.00089831, lon: 0.00449155, t: 2000, heading: 90),
    )!;
    expect(offRoute.state, TrackerState.offRoute);
    final staleAfterOffRoute = tracker.report(
      const Fix(lat: 0, lon: 0.0017966, t: 1000, heading: 90),
    )!;
    expect(staleAfterOffRoute.state, TrackerState.offRoute);
    expect((staleAfterOffRoute.progress - valid.progress).abs(), lessThan(0.1));
    expect(staleAfterOffRoute.point.lat.abs(), lessThan(1e-8));
    final next = tracker.report(
      const Fix(lat: 0, lon: 0.00269493, t: 3000, heading: 90),
    )!;
    expect((next.progress - 300).abs(), lessThan(1));
    expect(
      (tracker.distanceTo(const Point(lat: 0, lon: 0.00718648))! - 500).abs(),
      lessThan(1),
    );
  });
}
