import 'package:alongroute/alongroute.dart';
import 'package:test/test.dart';

void main() {
  test('project clamps to both segment ends', () {
    final route = prepareRoute([
      const Point(lat: 0, lon: 0),
      const Point(lat: 0, lon: 0.001),
    ], loop: false);
    expect(route.project(const Point(lat: 0, lon: -0.001)).progress, 0);
    expect(
      (route.project(const Point(lat: 0, lon: 0.002)).progress - route.length)
          .abs(),
      lessThan(1e-8),
    );
  });

  test('project skips zero-length segments', () {
    final route = prepareRoute([
      const Point(lat: 0, lon: 0),
      const Point(lat: 0, lon: 0),
      const Point(lat: 0, lon: 0.001),
    ], loop: false);
    expect(
      (route.project(const Point(lat: 0, lon: 0.0005)).progress -
              route.length / 2)
          .abs(),
      lessThan(1e-8),
    );
  });

  test('project requires two points and a nonzero segment', () {
    expect(
      () => prepareRoute([const Point(lat: 0, lon: 0)]),
      throwsA(
        isA<ArgumentError>().having(
          (e) => e.message,
          'message',
          contains('at least two points'),
        ),
      ),
    );
    expect(
      () => prepareRoute([
        const Point(lat: 0, lon: 0),
        const Point(lat: 0, lon: 0),
      ]),
      throwsA(
        isA<ArgumentError>().having(
          (e) => e.message,
          'message',
          contains('non-zero-length segment'),
        ),
      ),
    );
  });
}
