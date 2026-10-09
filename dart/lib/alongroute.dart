import 'dart:math' as math;

const double _earthRadius = 6378137;
const double _rad = math.pi / 180;
const double _cellSize = 100, _searchRadius = 300;

class Point {
  const Point({required this.lat, required this.lon});
  final double lat;
  final double lon;
}

class Fix extends Point {
  const Fix({
    required super.lat,
    required super.lon,
    required this.t,
    this.heading,
    this.speed,
    this.accuracy,
  });
  final double t;
  final double? heading;
  final double? speed;
  final double? accuracy;
}

class Projection {
  const Projection({required this.progress, required this.offset});
  final double progress;
  final double offset;
}

class Reading {
  const Reading({
    required this.progress,
    required this.lap,
    required this.point,
    required this.heading,
    required this.state,
    required this.offset,
  });
  final double progress;
  final int lap;
  final Point point;
  final double heading;
  final TrackerState state;
  final double offset;

  Reading _copy({
    double? progress,
    int? lap,
    Point? point,
    double? heading,
    TrackerState? state,
    double? offset,
  }) =>
      Reading(
        progress: progress ?? this.progress,
        lap: lap ?? this.lap,
        point: point ?? Point(lat: this.point.lat, lon: this.point.lon),
        heading: heading ?? this.heading,
        state: state ?? this.state,
        offset: offset ?? this.offset,
      );
}

enum TrackerState { live, stale, lost, offRoute }

class _Segment {
  const _Segment(
    this.x,
    this.y,
    this.dx,
    this.dy,
    this.length,
    this.start,
    this.heading,
  );
  final double x, y, dx, dy, length, start, heading;
}

class _Candidate {
  const _Candidate(this.progress, this.offset, this.heading);
  final double progress, offset, heading;
}

class _LocalPoint {
  const _LocalPoint(this.x, this.y);
  final double x, y;
}

class Route {
  Route._(
    this.points,
    this.loop,
    this.length,
    this._lat0,
    this._lon0,
    this._kx,
    this._segments,
    this._grid,
    this._minX,
    this._maxX,
    this._minY,
    this._maxY,
  );
  final List<Point> points;
  final bool loop;
  final double length;
  final double _lat0, _lon0, _kx;
  final List<_Segment> _segments;
  final Map<String, List<int>> _grid;
  final int _minX, _maxX, _minY, _maxY;
  int _distanceChecks = 0;
  int get distanceChecks => _distanceChecks;
  List<Projection> debugCandidates(Point point) => _candidates(point)
      .map((c) => Projection(progress: c.progress, offset: c.offset))
      .toList();

  Projection project(Point point) {
    final candidate = _choose(_candidates(point));
    return Projection(progress: candidate.progress, offset: candidate.offset);
  }

  _LocalPoint _local(Point p) => _LocalPoint(
        (p.lon - _lon0) * _rad * _kx,
        (p.lat - _lat0) * _rad * _earthRadius,
      );

  List<_Candidate> _candidates(Point point) {
    final q = _local(point);
    final cx = (q.x / _cellSize).floor(), cy = (q.y / _cellSize).floor();
    final outside = cx < _minX || cx > _maxX || cy < _minY || cy > _maxY;
    final maxRing = outside ? 0 : [cx - _minX, _maxX - cx, cy - _minY, _maxY - cy].reduce(math.max);
    final found = <int>{}, examined = <int>{};
    var best = double.infinity;
    for (var ring = 0; ring <= maxRing; ring++) {
      for (var x = cx - ring; x <= cx + ring; x++) {
        for (var y = cy - ring; y <= cy + ring; y++) {
          if (ring > 0 && x != cx - ring && x != cx + ring && y != cy - ring && y != cy + ring) continue;
          found.addAll(_grid['$x,$y'] ?? const []);
        }
      }
      if (found.isNotEmpty) {
        for (final i in found) { if (!examined.add(i)) continue; final s = _segments[i]; final t = (((q.x - s.x) * s.dx + (q.y - s.y) * s.dy) / (s.length * s.length)).clamp(0.0, 1.0).toDouble(); _distanceChecks++; best = math.min(best, math.sqrt(math.pow(q.x - s.x - t * s.dx, 2) + math.pow(q.y - s.y - t * s.dy, 2))); }
        if (outside || math.max(0, (ring - 1) * _cellSize) > best + 15) break;
      }
      if (ring == maxRing) break;
    }
    final indices = outside ? List.generate(_segments.length, (i) => i) : found.toList()..sort();
    return indices.map((i) { final s = _segments[i]; _distanceChecks++;
      final t =
          (((q.x - s.x) * s.dx + (q.y - s.y) * s.dy) / (s.length * s.length))
              .clamp(0.0, 1.0)
              .toDouble();
      return _Candidate(
        s.start + t * s.length,
        math.sqrt(
          math.pow(q.x - s.x - t * s.dx, 2) + math.pow(q.y - s.y - t * s.dy, 2),
        ),
        s.heading,
      );
    }).toList();
  }

  _Candidate _choose(List<_Candidate> candidates, [double? heading]) {
    final nearest =
        candidates.map((c) => c.offset).reduce((a, b) => a < b ? a : b);
    final close = candidates.where((c) => c.offset <= nearest + 15).toList();
    close.sort((a, b) {
      final angle = heading == null
          ? 0
          : _angleDiff(
              a.heading,
              heading,
            ).compareTo(_angleDiff(b.heading, heading));
      return angle != 0 ? angle : a.offset.compareTo(b.offset);
    });
    return close.first;
  }

  ({Point point, double heading}) _at(double progress) {
    final p = loop
        ? ((progress % length) + length) % length
        : progress.clamp(0.0, length).toDouble();
    final s = _segments.firstWhere(
      (x) => p <= x.start + x.length,
      orElse: () => _segments.last,
    );
    final t = ((p - s.start) / s.length).clamp(0.0, 1.0).toDouble();
    return (
      point: Point(
        lat: (s.y + t * s.dy) / (_earthRadius * _rad) + _lat0,
        lon: (s.x + t * s.dx) / (_earthRadius * math.cos(_lat0 * _rad) * _rad) +
            _lon0,
      ),
      heading: s.heading,
    );
  }
}

Route prepareRoute(List<Point> points, {bool? loop}) {
  if (points.length < 2) {
    throw ArgumentError('Route must contain at least two points');
  }
  final lat0 = points.map((p) => p.lat).reduce((a, b) => a + b) / points.length;
  final lon0 = points.map((p) => p.lon).reduce((a, b) => a + b) / points.length;
  final kx = _earthRadius * math.cos(lat0 * _rad);
  final xy = points
      .map(
        (p) => _LocalPoint(
          (p.lon - lon0) * _rad * kx,
          (p.lat - lat0) * _rad * _earthRadius,
        ),
      )
      .toList();
  final close = math.sqrt(
    math.pow(xy.last.x - xy.first.x, 2) + math.pow(xy.last.y - xy.first.y, 2),
  );
  final isLoop = loop ?? close < 50;
  if (isLoop && close > 0) xy.add(xy.first);
  final segments = <_Segment>[];
  var length = 0.0;
  for (var i = 0; i < xy.length - 1; i++) {
    final a = xy[i], b = xy[i + 1], dx = b.x - a.x, dy = b.y - a.y;
    final len = math.sqrt(dx * dx + dy * dy);
    if (len == 0) continue;
    segments.add(
      _Segment(
        a.x,
        a.y,
        dx,
        dy,
        len,
        length,
        (math.atan2(dx, dy) / _rad + 360) % 360,
      ),
    );
    length += len;
  }
  if (length == 0) {
    throw ArgumentError(
      'Route must contain at least one non-zero-length segment',
    );
  }
  final grid = <String, List<int>>{};
  var minX = 1 << 60, maxX = -(1 << 60), minY = 1 << 60, maxY = -(1 << 60);
  for (var i = 0; i < segments.length; i++) {
    final s = segments[i];
    final x0 = ((math.min(s.x, s.x + s.dx) - _searchRadius) / _cellSize).floor(), x1 = ((math.max(s.x, s.x + s.dx) + _searchRadius) / _cellSize).floor();
    final y0 = ((math.min(s.y, s.y + s.dy) - _searchRadius) / _cellSize).floor(), y1 = ((math.max(s.y, s.y + s.dy) + _searchRadius) / _cellSize).floor();
    minX = math.min(minX, x0); maxX = math.max(maxX, x1); minY = math.min(minY, y0); maxY = math.max(maxY, y1);
    for (var x = x0; x <= x1; x++) { for (var y = y0; y <= y1; y++) { (grid['$x,$y'] ??= []).add(i); } }
  }
  return Route._(
    List.unmodifiable(points),
    isLoop,
    length,
    lat0,
    lon0,
    kx,
    List.unmodifiable(segments),
    grid, minX, maxX, minY, maxY,
  );
}

double _angleDiff(double a, double b) {
  final d = (a - b).abs() % 360;
  return math.min(d, 360 - d).toDouble();
}

class TrackerOptions {
  const TrackerOptions({
    this.vMax = 25,
    this.maxOffset = 60,
    this.maxStopOffset = 300,
    this.staleMs = 30000,
    this.lostMs = 120000,
    this.speedAlpha = 0.4,
    this.extrapolateMs = 5000,
    this.easeMs = 3000,
  });
  final double vMax,
      maxOffset,
      maxStopOffset,
      speedAlpha,
      extrapolateMs,
      easeMs;
  final double staleMs, lostMs;
}

class Tracker {
  Tracker(this.route, {this.options = const TrackerOptions()});
  final Route route;
  final TrackerOptions options;
  double? _previousProgress, _previousT, _lastFixT, _drawT, _backwardFrom;
  Reading? _current;
  int _lapBefore = 0, _lap = 0, _backwardFixes = 0;
  bool _offRoute = false;
  double _speed = 0, _drawFloor = 0, _drawBase = 0;

  TrackerState state(double nowMs) {
    if (_offRoute) return TrackerState.offRoute;
    if (_lastFixT == null) return TrackerState.lost;
    final age = math.max(0, nowMs - _lastFixT!);
    if (age <= options.staleMs) return TrackerState.live;
    return age <= options.lostMs ? TrackerState.stale : TrackerState.lost;
  }

  Reading? report(Fix fix) {
    if (_previousT != null && fix.t <= _previousT!) return _current?._copy();
    _lastFixT = fix.t;
    final dt = _previousT == null ? 0.0 : (fix.t - _previousT!) / 1000;
    final low = _previousProgress == null ? 0.0 : _previousProgress! - 50;
    final high = _previousProgress == null
        ? route.length
        : _previousProgress! + options.vMax * dt + 100;
    final candidates = route._candidates(fix);
    final inWindow = <_Candidate>[];
    for (final c in candidates) {
      if (high - low >= route.length ||
          (route.loop
              ? ((c.progress - low) % route.length + route.length) %
                      route.length <=
                  high - low
              : c.progress >= math.max(0, low) &&
                  c.progress <= math.min(route.length, high))) {
        inWindow.add(c);
      }
    }
    final c = route._choose(
      inWindow.isNotEmpty ? inWindow : candidates,
      fix.heading,
    );
    final drawn = at(fix.t);
    final drawnAbsolute = drawn == null
        ? 0.0
        : drawn.progress + drawn.lap * (route.loop ? route.length : 0);
    if (c.offset > options.maxOffset) {
      _offRoute = true;
      if (drawn != null) {
        _current = drawn._copy(state: TrackerState.offRoute, offset: c.offset);
        _drawFloor = _drawBase = drawnAbsolute;
        _drawT = fix.t;
        _speed = 0;
        _backwardFrom = null;
      }
      return _current?._copy();
    }
    _offRoute = false;
    var progress = c.progress;
    var acceptedBackward = false;
    if (_previousProgress != null) {
      final rawDelta = progress - _previousProgress!;
      final forwardDelta = route.loop
          ? (rawDelta % route.length + route.length) % route.length
          : rawDelta;
      final isBackward =
          route.loop ? forwardDelta > route.length / 2 : rawDelta < 0;
      final distanceBehind =
          route.loop ? route.length - forwardDelta : -rawDelta;
      if (isBackward && distanceBehind <= 30) {
        progress = _previousProgress!;
        _backwardFixes = 0;
      } else if (isBackward) {
        _backwardFixes++;
        if (_backwardFixes < 2) {
          progress = _previousProgress!;
        } else {
          if (route.loop &&
              _previousProgress! < route.length / 2 &&
              c.progress > route.length / 2) {
            _lap = math.max(0, _lap - 1).toInt();
          }
          _backwardFixes = 0;
          acceptedBackward = true;
        }
      } else {
        if (route.loop &&
            c.progress < _previousProgress! &&
            forwardDelta < route.length / 2) {
          _lap++;
        }
        _backwardFixes = 0;
      }
    }
    final absolute = progress + _lap * (route.loop ? route.length : 0);
    if (_previousProgress != null && dt > 0) {
      final delta = absolute -
          (_previousProgress! + _lapBefore * (route.loop ? route.length : 0));
      _speed +=
          options.speedAlpha * (math.max(0.0, delta / dt).toDouble() - _speed);
    }
    _previousProgress = progress;
    _previousT = fix.t;
    _lapBefore = _lap;
    final position = route._at(progress);
    _current = Reading(
      progress: progress,
      lap: route.loop ? _lap : 0,
      point: position.point,
      heading: position.heading,
      state: TrackerState.live,
      offset: c.offset,
    );
    _backwardFrom = acceptedBackward ? drawnAbsolute : null;
    _drawFloor = acceptedBackward
        ? absolute
        : math.max(drawnAbsolute, absolute).toDouble();
    _drawBase = absolute;
    _drawT = fix.t;
    return _current?._copy();
  }

  Reading? at(double nowMs) {
    final current = _current;
    if (current == null) return null;
    if (_offRoute || _drawT == null) return current._copy(state: state(nowMs));
    final age = math.max(0.0, nowMs - _drawT!).toDouble();
    if (_backwardFrom != null) {
      final target = _drawBase;
      final absolute =
          target + (_backwardFrom! - target) * (1 - math.min(age / 2000, 1));
      final lap = route.loop ? (absolute / route.length).floor() : 0;
      final progress = route.loop ? absolute % route.length : absolute;
      final position = route._at(progress);
      return current._copy(
        progress: progress,
        lap: lap,
        point: position.point,
        heading: position.heading,
        state: state(nowMs),
      );
    }
    final moving = math.min(age, options.extrapolateMs).toDouble();
    final easing = math
        .min(math.max(0.0, age - options.extrapolateMs), options.easeMs)
        .toDouble();
    final easeDistance = options.easeMs == 0
        ? 0.0
        : easing - easing * easing / (2 * options.easeMs);
    final distance = _speed * (moving + easeDistance) / 1000;
    var absolute = math.max(_drawFloor, _drawBase + distance).toDouble();
    if (!route.loop) absolute = math.min(route.length, absolute).toDouble();
    final lap = route.loop ? (absolute / route.length).floor() : 0;
    final progress = route.loop ? absolute % route.length : absolute;
    final position = route._at(progress);
    return current._copy(
      progress: progress,
      lap: lap,
      point: position.point,
      heading: position.heading,
      state: state(nowMs),
    );
  }

  double? distanceTo(Point point) {
    final current = _current;
    if (current == null || _offRoute || current.offset > 60) return null;
    final candidates = route._candidates(point);
    final nearest =
        candidates.map((c) => c.offset).reduce((a, b) => a < b ? a : b);
    if (nearest > options.maxStopOffset) return null;
    var distance = double.infinity;
    for (final c in candidates.where((c) => c.offset <= nearest + 15)) {
      var d = c.progress - current.progress;
      if (route.loop) {
        d = (d % route.length + route.length) % route.length;
        if (route.length - d < 30) d = 0;
      } else if (d < 0) {
        if (d > -30) {
          d = 0;
        } else {
          continue;
        }
      }
      distance = math.min(distance, d + c.offset).toDouble();
    }
    return distance.isFinite ? distance : null;
  }
}
