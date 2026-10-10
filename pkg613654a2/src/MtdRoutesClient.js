/*
 * MtdRoutesClient — composes raw CUMTD JSON endpoints into the baseline-route shape.
 *
 * Abstract @rest methods (getDeparturesByStop / getStopTimesByTrip / searchStops) are handled
 * by the platform; only the helpers below are implemented here. The CUMTD key is read from
 * MtdApiConfig at call time and passed as the `key` query parameter — never logged or returned.
 */

var MTD_DEFAULT_MAX_TRIPS = 20;
var MTD_TOP_LINES = 10; // how many bus routes (by frequency) to surface per starting point

/** Collapse a CUMTD stop-point id ("IT:1") to its parent stop id ("IT"). */
function _parentStop(id) {
  if (!id) {
    return id;
  }
  var idx = id.indexOf(':');
  if (idx >= 0) {
    return id.substring(0, idx);
  }
  return id;
}

/** Read the secret CUMTD key; throw a clear, secret-free error if it is missing. */
function _mtdApiKey() {
  var config = MtdApiConfig.getConfig();
  var secret = config ? config.getSecret() : null;
  var key = secret ? secret.apiKey : null;
  if (!key) {
    throw new Error(
      'CUMTD API key is not configured. Set MtdApiConfig.apiKey in the platform secret store.'
    );
  }
  return key;
}

function initialize() {
  var config = MtdApiConfig.getConfig();
  var baseUrl = config && config.baseUrl ? config.baseUrl : 'https://developer.cumtd.com/api/v2.2/json/';
  MtdRoutesClient.setApiUrlAndAuth(baseUrl, '');
}

/* Collect a trip's downstream destinations (parent-collapsed) into a dest map/order pair. */
function _accumulateDownstream(times, parent, destMap, destOrder) {
  var j;
  var startIdx = -1;
  for (j = 0; j < times.length; j++) {
    if (_parentStop(times[j].stop_id) === parent) {
      startIdx = j;
      break;
    }
  }
  if (startIdx < 0) {
    return;
  }
  for (j = startIdx + 1; j < times.length; j++) {
    var st = times[j];
    var dkey = _parentStop(st.stop_id);
    if (!dkey || dkey === parent) {
      continue;
    }
    var entry = destMap[dkey];
    if (entry === undefined) {
      entry = { stop_id: dkey, name: st.name, arrival_times: [] };
      destMap[dkey] = entry;
      destOrder.push(dkey);
    }
    entry.arrival_times.push(st.arrival_time);
  }
}

/* Flatten an ordered dest-key list + dest map into the destinations array. */
function _destArray(destOrder, destMap) {
  var destinations = [];
  var k;
  for (k = 0; k < destOrder.length; k++) {
    destinations.push(destMap[destOrder[k]]);
  }
  return destinations;
}

/*
 * Pure transform: given a start stop id, a normalized list of departures
 * ([{trip_id, scheduled, routeId, busNumber, routeColor}]) and a map
 * trip_id -> ordered [{stop_id, name, arrival_time}], build the one-key baseline-route map.
 *
 * Each start stop carries both the aggregate route (all trips, kept for the planner's headway
 * comparison) AND a `lines` breakdown identifying each distinct bus route by its CUMTD bus number,
 * sorted by scheduled-trip frequency (a verified feed metric) and capped at the most frequent
 * MTD_TOP_LINES. Written with explicit
 * intermediate vars to avoid the Rhino "Bad type on operand stack" VerifyError on compound ops.
 */
function _buildRoutes(stopId, departures, stopTimesByTrip) {
  var parent = _parentStop(stopId);
  var departureTimes = [];
  var destMap = {};
  var destOrder = [];
  var lineMap = {};
  var lineOrder = [];
  var i;
  for (i = 0; i < departures.length; i++) {
    var dep = departures[i];
    if (dep.scheduled) {
      departureTimes.push(dep.scheduled);
    }
    var routeId = dep.routeId ? dep.routeId : 'unknown';
    var line = lineMap[routeId];
    if (line === undefined) {
      line = {
        busNumber: dep.busNumber ? dep.busNumber : routeId,
        routeId: routeId,
        routeColor: dep.routeColor ? dep.routeColor : null,
        departure_times: [],
        destMap: {},
        destOrder: [],
        count: 0,
      };
      lineMap[routeId] = line;
      lineOrder.push(routeId);
    }
    var newCount = line.count + 1;
    line.count = newCount;
    if (dep.scheduled) {
      line.departure_times.push(dep.scheduled);
    }
    var times = stopTimesByTrip[dep.trip_id];
    if (!times) {
      continue;
    }
    _accumulateDownstream(times, parent, destMap, destOrder);
    _accumulateDownstream(times, parent, line.destMap, line.destOrder);
  }

  var lines = [];
  var li;
  for (li = 0; li < lineOrder.length; li++) {
    var ln = lineMap[lineOrder[li]];
    lines.push({
      busNumber: ln.busNumber,
      routeId: ln.routeId,
      routeColor: ln.routeColor,
      tripCount: ln.count,
      departure_times: ln.departure_times,
      destinations: _destArray(ln.destOrder, ln.destMap),
    });
  }
  lines.sort(function (a, b) {
    return b.tripCount - a.tripCount;
  });
  if (lines.length > MTD_TOP_LINES) {
    lines = lines.slice(0, MTD_TOP_LINES);
  }

  var result = {};
  result[stopId] = {
    departure_times: departureTimes,
    destinations: _destArray(destOrder, destMap),
    lines: lines,
  };
  return result;
}

function baselineRoutes(stopId, maxTrips) {
  if (!stopId) {
    throw new Error('baselineRoutes requires a CUMTD stopId.');
  }
  initialize();
  var key = _mtdApiKey();
  var cap = maxTrips && maxTrips > 0 ? maxTrips : MTD_DEFAULT_MAX_TRIPS;

  var depResp = MtdRoutesClient.getDeparturesByStop(stopId, key);
  var departures = depResp && depResp.departures ? depResp.departures : [];

  var norm = [];
  var i;
  for (i = 0; i < departures.length && norm.length < cap; i++) {
    var d = departures[i];
    var tripId = d.trip && d.trip.trip_id ? d.trip.trip_id : d.trip_id;
    if (!tripId) {
      continue;
    }
    var sched = d.scheduled ? d.scheduled : d.expected;
    var route = d.route ? d.route : {};
    var busNum = route.route_short_name ? route.route_short_name : route.route_id;
    norm.push({
      trip_id: tripId,
      scheduled: sched,
      routeId: route.route_id ? route.route_id : null,
      busNumber: busNum,
      routeColor: route.route_color ? route.route_color : null,
    });
  }

  var stopTimesByTrip = {};
  for (i = 0; i < norm.length; i++) {
    var tid = norm[i].trip_id;
    if (stopTimesByTrip[tid] !== undefined) {
      continue;
    }
    var stResp = MtdRoutesClient.getStopTimesByTrip(tid, key);
    var sts = stResp && stResp.stop_times ? stResp.stop_times : [];
    var arr = [];
    var j;
    for (j = 0; j < sts.length; j++) {
      var sp = sts[j].stop_point ? sts[j].stop_point : {};
      var nm = sp.stop_name ? sp.stop_name : sp.name;
      arr.push({ stop_id: sp.stop_id, name: nm, arrival_time: sts[j].arrival_time });
    }
    stopTimesByTrip[tid] = arr;
  }

  return _buildRoutes(stopId, norm, stopTimesByTrip);
}

function baselineRoutesForStops(stopIds, maxTrips) {
  var merged = {};
  if (!stopIds) {
    return merged;
  }
  var i;
  for (i = 0; i < stopIds.length; i++) {
    var one = baselineRoutes(stopIds[i], maxTrips);
    var keys = Object.keys(one);
    var k;
    for (k = 0; k < keys.length; k++) {
      merged[keys[k]] = one[keys[k]];
    }
  }
  return merged;
}

function findStops(query) {
  if (!query) {
    return [];
  }
  initialize();
  var key = _mtdApiKey();
  var resp = MtdRoutesClient.searchStops(query, 10, key);
  var stops = resp && resp.stops ? resp.stops : [];
  var out = [];
  var i;
  for (i = 0; i < stops.length; i++) {
    out.push({ stop_id: stops[i].stop_id, name: stops[i].stop_name });
  }
  return out;
}
