part of 'alongroute.dart';

const _snapshotKeys = {
  'version', 'previousProgress', 'previousT', 'current', 'lapBefore',
  'lastFixT', 'offRoute', 'lap', 'speed', 'drawFloor', 'drawT', 'drawBase',
  'backwardFrom', 'backwardCandidate', 'options',
};
const _optionKeys = {
  'vMax', 'maxOffset', 'maxStopOffset', 'staleMs', 'lostMs', 'speedAlpha',
  'extrapolateMs', 'easeMs',
};
const _readingKeys = {'progress', 'lap', 'point', 'heading', 'state', 'offset'};
const _pointKeys = {'lat', 'lon'};
bool _shape(Object? x, Set<String> keys) => x is Map && x.length == keys.length &&
    x.keys.every((k) => k is String && keys.contains(k));
bool _number(Object? x) => x is num && x.isFinite;
bool _integer(Object? x) => x is num && x.isFinite && x == x.toInt();
bool _nullable(Object? x) => x == null || _number(x);

Map<String, Object?> snapshot(Tracker tracker) => {
  'version': 1,
  'previousProgress': tracker._previousProgress,
  'previousT': tracker._previousT,
  'current': tracker._current == null ? null : {
    'progress': tracker._current!.progress, 'lap': tracker._current!.lap,
    'point': {'lat': tracker._current!.point.lat, 'lon': tracker._current!.point.lon},
    'heading': tracker._current!.heading, 'state': tracker._current!.state.name,
    'offset': tracker._current!.offset,
  },
  'lapBefore': tracker._lapBefore, 'lastFixT': tracker._lastFixT,
  'offRoute': tracker._offRoute, 'lap': tracker._lap, 'speed': tracker._speed,
  'drawFloor': tracker._drawFloor, 'drawT': tracker._drawT,
  'drawBase': tracker._drawBase, 'backwardFrom': tracker._backwardFrom,
  'backwardCandidate': tracker._backwardCandidate,
  'options': {'vMax': tracker.options.vMax, 'maxOffset': tracker.options.maxOffset,
    'maxStopOffset': tracker.options.maxStopOffset,
    'staleMs': tracker.options.staleMs, 'lostMs': tracker.options.lostMs,
    'speedAlpha': tracker.options.speedAlpha,
    'extrapolateMs': tracker.options.extrapolateMs, 'easeMs': tracker.options.easeMs},
};

Tracker restore(Route route, Object? snapshot,
    {TrackerOptions? options}) {
  try {
    if (snapshot is! Map || !_shape(snapshot, _snapshotKeys)) throw ArgumentError();
    final s = snapshot, currentValue = s['current'], optionsValue = s['options'];
    if (s['version'] != 1 || !_nullable(s['previousProgress']) ||
        !_nullable(s['previousT']) || !_integer(s['lapBefore']) ||
        !_nullable(s['lastFixT']) || s['offRoute'] is! bool ||
        !_integer(s['lap']) || !_number(s['speed']) || !_number(s['drawFloor']) ||
        !_nullable(s['drawT']) || !_number(s['drawBase']) ||
        !_nullable(s['backwardFrom']) || !_nullable(s['backwardCandidate']) ||
        optionsValue is! Map ||
        optionsValue.keys.any((k) => k is! String || !_optionKeys.contains(k)) ||
        optionsValue.values.any((v) => !_number(v))) {
      throw ArgumentError();
    }
    Map? current, point;
    if (currentValue != null) {
      if (!_shape(currentValue, _readingKeys)) throw ArgumentError();
      current = currentValue as Map;
      final pointValue = current['point'];
      if (!_number(current['progress']) || !_integer(current['lap']) ||
          !_number(current['heading']) || !_number(current['offset']) ||
          !['live', 'stale', 'lost', 'offRoute'].contains(current['state']) ||
          !_shape(pointValue, _pointKeys)) {
        throw ArgumentError();
      }
      point = pointValue as Map;
      if (!_number(point['lat']) || !_number(point['lon'])) throw ArgumentError();
    }
    final progress = s['previousProgress'] as num?, backward = s['backwardCandidate'] as num?;
    if ((progress != null && (progress < 0 || progress > route.length)) ||
        (current != null && ((current['progress'] as num) < 0 || (current['progress'] as num) > route.length)) ||
        (backward != null && (backward < 0 || backward > route.length))) {
      throw ArgumentError();
    }
    final o = optionsValue;
    TrackerOptions readOptions() => TrackerOptions(
      vMax: (o['vMax'] as num?)?.toDouble() ?? 25,
      maxOffset: (o['maxOffset'] as num?)?.toDouble() ?? 60,
      maxStopOffset: (o['maxStopOffset'] as num?)?.toDouble() ?? 300,
      staleMs: (o['staleMs'] as num?)?.toDouble() ?? 45000,
      lostMs: (o['lostMs'] as num?)?.toDouble() ?? 300000,
      speedAlpha: (o['speedAlpha'] as num?)?.toDouble() ?? 0.4,
      extrapolateMs: (o['extrapolateMs'] as num?)?.toDouble() ?? 5000,
      easeMs: (o['easeMs'] as num?)?.toDouble() ?? 3000);
    double? n(String key) => (s[key] as num?)?.toDouble();
    final tracker = Tracker(route, options: options ?? readOptions());
    tracker._previousProgress = n('previousProgress'); tracker._previousT = n('previousT');
    tracker._current = current == null ? null : Reading(
      progress: (current['progress'] as num).toDouble(), lap: (current['lap'] as num).toInt(),
      point: Point(lat: (point!['lat'] as num).toDouble(), lon: (point['lon'] as num).toDouble()),
      heading: (current['heading'] as num).toDouble(),
      state: TrackerState.values.byName(current['state'] as String),
      offset: (current['offset'] as num).toDouble());
    tracker._lapBefore = (s['lapBefore'] as num).toInt(); tracker._lastFixT = n('lastFixT');
    tracker._offRoute = s['offRoute'] as bool; tracker._lap = (s['lap'] as num).toInt();
    tracker._speed = (s['speed'] as num).toDouble(); tracker._drawFloor = (s['drawFloor'] as num).toDouble();
    tracker._drawT = n('drawT'); tracker._drawBase = (s['drawBase'] as num).toDouble();
    tracker._backwardFrom = n('backwardFrom'); tracker._backwardCandidate = n('backwardCandidate');
    return tracker;
  } catch (_) {
    throw ArgumentError('Invalid snapshot');
  }
}
