/*
 * RoutePlanner.generateRoute — builds a candidate bus route for a MergedEvent from current
 * routes, mean time to service, event capacity, Google Maps travel times and route convolution.
 *
 * RoutePlanner.generateNetwork — builds a NETWORK of supplemental proposal routes over all
 * upcoming events in a window. Routes are demand corridors (NOT one-per-bus); a fleet of vehicles
 * is then assigned to the routes. See generateNetwork for the full contract.
 *
 * Transparent heuristics throughout. Written with explicit intermediate variables (no `obj[k]++`
 * / `obj[k] = (obj[k]||0)+1`) to avoid the Rhino "Bad type on operand stack" VerifyError.
 */

var AVG_BUS_SPEED_MPS = 6.7; // ~15 mph incl. dwell — fallback when Google Directions is unavailable
var CONVOLUTION_KERNEL_M = 600; // demand peaks within this distance merge into one stop
var DEFAULT_SERVICE_WINDOW_MIN = 90; // span of departures ending at event start
var DEFAULT_BUS_CAPACITY = 40;
var DEFAULT_MEAN_TIME_TO_SERVICE_MIN = 7.5;
var EVENT_INCLUDE =
  'this, venue.id, venue.name, venue.capacity, venue.latitude, venue.longitude';

/* ---------- geometry + time helpers ---------- */

function _haversine(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function _parseIso(s) {
  if (!s) {
    return null;
  }
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    return null;
  }
  var ss = m[6] ? parseInt(m[6], 10) : 0;
  return Date.UTC(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    ss
  );
}

function _pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function _fmtIso(ms) {
  var d = new Date(ms);
  return (
    d.getUTCFullYear() +
    '-' +
    _pad(d.getUTCMonth() + 1) +
    '-' +
    _pad(d.getUTCDate()) +
    'T' +
    _pad(d.getUTCHours()) +
    ':' +
    _pad(d.getUTCMinutes()) +
    ':' +
    _pad(d.getUTCSeconds())
  );
}

function _slug(s) {
  var base = String(s === undefined || s === null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
  return base.substring(0, 40);
}

function _round1(x) {
  return Math.round(x * 10) / 10;
}

/* ---------- Google Directions key / init ---------- */

function _googleKey() {
  var config = GoogleMapsConfig.getConfig();
  var secret = config ? config.getSecret() : null;
  var key = secret ? secret.apiKey : null;
  return key ? key : null;
}

function _initGoogle() {
  var config = GoogleMapsConfig.getConfig();
  var baseUrl = config && config.baseUrl ? config.baseUrl : 'https://maps.googleapis.com/maps/api/';
  GoogleDirectionsClient.setApiUrlAndAuth(baseUrl, '');
}

/*
 * Route convolution: project rider-origin stops onto the radial corridor toward the venue
 * (distance-to-venue), order them farthest-first, then convolve the demand series with a
 * box kernel of width CONVOLUTION_KERNEL_M — consecutive stops whose weighted centroid is
 * within the kernel merge into one consolidated stop. Returns consolidated stops inbound order.
 */
function _convolve(pickups, venueLat, venueLng) {
  var i;
  var withDist = [];
  for (i = 0; i < pickups.length; i++) {
    var p = pickups[i];
    var dist = _haversine(p.latitude, p.longitude, venueLat, venueLng);
    withDist.push({
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      weight: p.weight,
      stopType: p.stopType,
      distToVenue: dist,
    });
  }
  // farthest-first inbound ordering
  withDist.sort(function (a, b) {
    return b.distToVenue - a.distToVenue;
  });

  var groups = [];
  var current = null;
  for (i = 0; i < withDist.length; i++) {
    var s = withDist[i];
    if (current === null) {
      current = {
        latSum: s.latitude * s.weight,
        lngSum: s.longitude * s.weight,
        weight: s.weight,
        members: [s.name],
        centroidLat: s.latitude,
        centroidLng: s.longitude,
      };
      continue;
    }
    var gap = _haversine(s.latitude, s.longitude, current.centroidLat, current.centroidLng);
    if (gap <= CONVOLUTION_KERNEL_M) {
      var newWeight = current.weight + s.weight;
      var newLatSum = current.latSum + s.latitude * s.weight;
      var newLngSum = current.lngSum + s.longitude * s.weight;
      current.weight = newWeight;
      current.latSum = newLatSum;
      current.lngSum = newLngSum;
      current.centroidLat = newLatSum / newWeight;
      current.centroidLng = newLngSum / newWeight;
      current.members.push(s.name);
    } else {
      groups.push(current);
      current = {
        latSum: s.latitude * s.weight,
        lngSum: s.longitude * s.weight,
        weight: s.weight,
        members: [s.name],
        centroidLat: s.latitude,
        centroidLng: s.longitude,
      };
    }
  }
  if (current !== null) {
    groups.push(current);
  }
  return groups;
}

/* Try Google Directions for the full route; return per-leg seconds or null on any failure. */
function _googleLegSeconds(nodes) {
  var key = _googleKey();
  if (!key) {
    return null;
  }
  try {
    _initGoogle();
    var origin = nodes[0].latitude + ',' + nodes[0].longitude;
    var destination = nodes[nodes.length - 1].latitude + ',' + nodes[nodes.length - 1].longitude;
    var mids = [];
    var i;
    for (i = 1; i < nodes.length - 1; i++) {
      mids.push(nodes[i].latitude + ',' + nodes[i].longitude);
    }
    var waypoints = mids.join('|');
    var resp = GoogleDirectionsClient.getDirections(origin, destination, waypoints, 'driving', key);
    if (!resp || resp.status !== 'OK' || !resp.routes || resp.routes.length === 0) {
      return null;
    }
    var legs = resp.routes[0].legs;
    if (!legs || legs.length !== nodes.length - 1) {
      return null;
    }
    var out = [];
    for (i = 0; i < legs.length; i++) {
      var dur = legs[i].duration && legs[i].duration.value ? legs[i].duration.value : 0;
      var distv = legs[i].distance && legs[i].distance.value ? legs[i].distance.value : 0;
      out.push({ seconds: dur, meters: distv });
    }
    return out;
  } catch (e) {
    return null;
  }
}

/* Baseline cadence: median spacing (minutes) of a baseline route's departure_times. */
function _baselineMedianHeadwayMin(baselineRoutes) {
  if (!baselineRoutes) {
    return null;
  }
  var keys = Object.keys(baselineRoutes);
  if (keys.length === 0) {
    return null;
  }
  var times = baselineRoutes[keys[0]].departure_times || [];
  var ms = [];
  var i;
  for (i = 0; i < times.length; i++) {
    var t = _parseIso(times[i]);
    if (t !== null) {
      ms.push(t);
    }
  }
  if (ms.length < 2) {
    return null;
  }
  ms.sort(function (a, b) {
    return a - b;
  });
  var diffs = [];
  for (i = 1; i < ms.length; i++) {
    diffs.push((ms[i] - ms[i - 1]) / 60000);
  }
  diffs.sort(function (a, b) {
    return a - b;
  });
  var mid = Math.floor(diffs.length / 2);
  return _round1(diffs[mid]);
}

/* ---------- main entry point ---------- */

function generateRoute(mergedEventId, meanTimeToServiceMin, busCapacity, baselineRoutes) {
  var res = MergedEvent.fetch({
    filter: Filter.eq('id', mergedEventId),
    include: EVENT_INCLUDE,
    limit: 1,
  });
  var ev = res && res.objs && res.objs.length > 0 ? res.objs[0] : null;
  if (!ev) {
    throw new Error('MergedEvent not found: ' + mergedEventId);
  }

  var venue = ev.venue;
  var venueLat = venue && venue.latitude != null ? venue.latitude : ev.latitude;
  var venueLng = venue && venue.longitude != null ? venue.longitude : ev.longitude;
  if (venueLat == null || venueLng == null) {
    throw new Error('Event has no venue coordinates; cannot plan a route for ' + mergedEventId);
  }

  // Rider-origin stop candidates become route pickups. Weight by candidate score (demand proxy).
  var raw = ev.startStopCandidates || [];
  var pickups = [];
  var i;
  for (i = 0; i < raw.length; i++) {
    var c = raw[i];
    if (c.latitude == null || c.longitude == null) {
      continue;
    }
    var w = c.score != null && c.score > 0 ? c.score : 0.1;
    pickups.push({
      name: c.name,
      latitude: c.latitude,
      longitude: c.longitude,
      weight: w,
      stopType: c.stopType,
    });
  }
  if (pickups.length === 0) {
    throw new Error(
      'Event ' + mergedEventId + ' has no start-stop candidates; run EventResolver.resolveAll first.'
    );
  }

  // (4) Route convolution -> consolidated inbound waypoints.
  var groups = _convolve(pickups, venueLat, venueLng);

  // Destination end stop: prefer the top end-stop candidate, else the venue itself.
  var endCands = ev.endStopCandidates || [];
  var endName = endCands.length > 0 ? endCands[0].name : venue && venue.name ? venue.name : ev.name;
  var endLat = endCands.length > 0 && endCands[0].latitude != null ? endCands[0].latitude : venueLat;
  var endLng = endCands.length > 0 && endCands[0].longitude != null ? endCands[0].longitude : venueLng;
  var venueStopId = venue && venue.id ? venue.id : 'venue_' + _slug(ev.name);

  // Ordered nodes: consolidated pickups (farthest first) then the venue end stop.
  var nodes = [];
  var totalWeight = 0;
  for (i = 0; i < groups.length; i++) {
    var g = groups[i];
    totalWeight = totalWeight + g.weight;
    nodes.push({
      stop_id: 'gen_' + _slug(g.members[0]) + '_' + i,
      name: g.members.length > 1 ? g.members[0] + ' (+' + (g.members.length - 1) + ')' : g.members[0],
      latitude: g.centroidLat,
      longitude: g.centroidLng,
      members: g.members,
      weight: g.weight,
    });
  }
  nodes.push({ stop_id: venueStopId, name: endName, latitude: endLat, longitude: endLng });

  // (Google Maps planning) per-leg travel seconds, with haversine fallback.
  var legSeconds = _googleLegSeconds(nodes);
  var travelBasis = 'google_directions';
  if (legSeconds === null) {
    travelBasis = 'haversine_estimate';
    legSeconds = [];
    for (i = 1; i < nodes.length; i++) {
      var meters = _haversine(
        nodes[i - 1].latitude,
        nodes[i - 1].longitude,
        nodes[i].latitude,
        nodes[i].longitude
      );
      legSeconds.push({ seconds: Math.round(meters / AVG_BUS_SPEED_MPS), meters: Math.round(meters) });
    }
  }

  // Cumulative seconds to each node after the start stop.
  var cumSec = [];
  var running = 0;
  for (i = 0; i < legSeconds.length; i++) {
    running = running + legSeconds[i].seconds;
    cumSec.push(running);
  }
  var totalTravelSec = running;

  // (2) + (3) Capacity -> departures; mean time to service -> headway.
  var demand = ev.estimatedPopulation != null && ev.estimatedPopulation > 0 ? ev.estimatedPopulation : null;
  var demandBasis = 'estimatedPopulation';
  if (demand === null) {
    if (venue && venue.capacity != null && venue.capacity > 0) {
      demand = venue.capacity;
      demandBasis = 'venue.capacity (no estimatedPopulation)';
    } else {
      demand = 500;
      demandBasis = 'default fallback (no estimate or capacity)';
    }
  }
  var busCap = busCapacity && busCapacity > 0 ? busCapacity : DEFAULT_BUS_CAPACITY;
  var targetWait =
    meanTimeToServiceMin && meanTimeToServiceMin > 0 ? meanTimeToServiceMin : DEFAULT_MEAN_TIME_TO_SERVICE_MIN;

  var headwayForWait = 2 * targetWait; // uniform-arrival mean wait = headway / 2
  var departuresNeeded = Math.ceil(demand / busCap);
  var serviceWindowMin = DEFAULT_SERVICE_WINDOW_MIN;
  var headwayForDemand = departuresNeeded > 0 ? serviceWindowMin / departuresNeeded : headwayForWait;
  var headwayMin = Math.min(headwayForWait, headwayForDemand);
  if (headwayMin < 2) {
    headwayMin = 2;
  }
  headwayMin = _round1(headwayMin);
  var busesScheduled = Math.floor(serviceWindowMin / headwayMin) + 1;

  // Anchor the schedule so the last bus reaches the venue by event start.
  var startMs = _parseIso(ev.startTime);
  if (startMs === null) {
    startMs = Date.now() + 24 * 3600 * 1000;
  }
  var lastDepMs = startMs - totalTravelSec * 1000;
  var firstDepMs = lastDepMs - serviceWindowMin * 60 * 1000;
  var headwayMs = headwayMin * 60 * 1000;

  var departureMs = [];
  var t = firstDepMs;
  while (t <= lastDepMs + 1) {
    departureMs.push(t);
    t = t + headwayMs;
  }

  var departureTimes = [];
  for (i = 0; i < departureMs.length; i++) {
    departureTimes.push(_fmtIso(departureMs[i]));
  }

  // Build destinations (every node after the start stop) with per-departure arrival times.
  var destinations = [];
  var startStop = nodes[0];
  var legsPlan = [];
  var di;
  for (di = 1; di < nodes.length; di++) {
    var node = nodes[di];
    var arrTimes = [];
    var k;
    for (k = 0; k < departureMs.length; k++) {
      arrTimes.push(_fmtIso(departureMs[k] + cumSec[di - 1] * 1000));
    }
    destinations.push({ stop_id: node.stop_id, name: node.name, arrival_times: arrTimes });
    legsPlan.push({
      from: nodes[di - 1].name,
      to: node.name,
      minutes: _round1(legSeconds[di - 1].seconds / 60),
      meters: legSeconds[di - 1].meters,
    });
  }

  var route = {};
  route[startStop.stop_id] = { departure_times: departureTimes, destinations: destinations };

  // Convolution rationale.
  var convGroups = [];
  for (i = 0; i < nodes.length - 1; i++) {
    convGroups.push({
      stop_id: nodes[i].stop_id,
      name: nodes[i].name,
      members: nodes[i].members,
      demandWeight: _round1(nodes[i].weight),
      estimatedRiders: Math.round((nodes[i].weight / (totalWeight > 0 ? totalWeight : 1)) * demand),
      latitude: nodes[i].latitude,
      longitude: nodes[i].longitude,
    });
  }

  // (1) Current-route comparison.
  var baselineKeys = baselineRoutes ? Object.keys(baselineRoutes) : [];
  var baselineHeadway = _baselineMedianHeadwayMin(baselineRoutes);

  var orderedStops = [];
  for (i = 0; i < nodes.length; i++) {
    orderedStops.push(nodes[i].name);
  }

  var plan = {
    event: {
      id: ev.id,
      name: ev.name,
      startTime: ev.startTime,
      venue: venue && venue.name ? venue.name : null,
      demand: demand,
      demandBasis: demandBasis,
    },
    service: {
      meanTimeToServiceMin: targetWait,
      busCapacity: busCap,
      departuresNeeded: departuresNeeded,
      headwayMin: headwayMin,
      headwayForWaitMin: _round1(headwayForWait),
      headwayForDemandMin: _round1(headwayForDemand),
      serviceWindowMin: serviceWindowMin,
      busesScheduled: busesScheduled,
      firstDeparture: _fmtIso(firstDepMs),
      lastDeparture: _fmtIso(lastDepMs),
    },
    travel: {
      basis: travelBasis,
      totalMinutes: _round1(totalTravelSec / 60),
      legs: legsPlan,
    },
    convolution: {
      kernelMeters: CONVOLUTION_KERNEL_M,
      originCandidates: pickups.length,
      consolidatedStops: nodes.length - 1,
      stops: convGroups,
    },
    orderedStops: orderedStops,
    baselineComparison: {
      knownStartStops: baselineKeys,
      baselineMedianHeadwayMin: baselineHeadway,
      note:
        baselineHeadway !== null
          ? 'Baseline median headway ' +
            baselineHeadway +
            ' min vs proposed ' +
            headwayMin +
            ' min for this surge.'
          : 'No baseline route cadence supplied for comparison.',
    },
  };

  return { route: route, plan: plan };
}

/* ===================== network planner (demand corridors + fleet assignment) ===================== */

var DEFAULT_NETWORK_WINDOW_DAYS = 14;
var SCHEDULE_WINDOW_MIN = 90; // pre-peak service window the emitted timetable spans
var MAX_DEPARTURES_PER_ROUTE = 60; // safety cap on emitted departure_times per route
var TARGET_STOPS_PER_ROUTE = 10; // default target useful stops per supplemental route
var MIN_STOPS_PER_ROUTE = 8;
var MAX_STOPS_PER_ROUTE = 12;
var DWELL_SEC_PER_STOP = 20; // boarding/alighting dwell at each stop
var TURNAROUND_SEC = 180; // layover/turnaround at the destination before the next run
var DEFAULT_TRANSIT_SHARE = 0.6; // fraction of attendees that use transit (PlannerConfig default)

/* Round coords to ~100 m so the same origin across many events merges into one demand peak. */
function _coordKey(lat, lng) {
  return Math.round(lat * 1000) / 1000 + ',' + Math.round(lng * 1000) / 1000;
}

/* Resolve the transit mode share from PlannerConfig (fraction of attendees that ride transit). */
function _transitShare() {
  try {
    var cfg = PlannerConfig.getConfig();
    var ts = cfg && cfg.transitShare != null ? cfg.transitShare : null;
    if (ts != null && ts > 0 && ts <= 1) {
      return ts;
    }
  } catch (e) {
    // fall through to default
  }
  return DEFAULT_TRANSIT_SHARE;
}

/*
 * Target stops per supplemental route: default TARGET_STOPS_PER_ROUTE, or the average stop count of
 * comparable existing MTD routes when a baseline map is supplied, clamped to [MIN, MAX].
 */
function _targetStopsPerRoute(baselineRoutes) {
  var t = TARGET_STOPS_PER_ROUTE;
  if (baselineRoutes) {
    var keys = Object.keys(baselineRoutes);
    var sum = 0;
    var n = 0;
    var i;
    for (i = 0; i < keys.length; i++) {
      var info = baselineRoutes[keys[i]];
      var lines = info && info.lines ? info.lines : null;
      if (lines && lines.length > 0) {
        var li;
        for (li = 0; li < lines.length; li++) {
          var dc = lines[li].destinations ? lines[li].destinations.length : 0;
          sum = sum + (dc + 1);
          n = n + 1;
        }
      } else if (info && info.destinations) {
        sum = sum + (info.destinations.length + 1);
        n = n + 1;
      }
    }
    if (n > 0) {
      t = Math.round(sum / n);
    }
  }
  if (t < MIN_STOPS_PER_ROUTE) {
    t = MIN_STOPS_PER_ROUTE;
  }
  if (t > MAX_STOPS_PER_ROUTE) {
    t = MAX_STOPS_PER_ROUTE;
  }
  return t;
}

/* Accumulate an event destination (its actual venue) onto an origin's destination map. */
function _addDest(entry, vkey, vname, vlat, vlng, w) {
  var d = entry.destMap[vkey];
  if (d === undefined) {
    entry.destMap[vkey] = { key: vkey, name: vname, latitude: vlat, longitude: vlng, weight: w };
    entry.destOrder.push(vkey);
  } else {
    var nw = d.weight + w;
    d.weight = nw;
  }
}

/*
 * Partition `stops` into `nRoutes` geographic clusters (demand corridors). Seeding is iterative
 * farthest-point: the first seed is the highest-demand stop, and each subsequent seed is the
 * remaining stop farthest (haversine) from every seed already chosen, so corridors spread across
 * distinct areas instead of one cluster swallowing every stop. Every other stop joins its nearest
 * seed. Returns up to `min(nRoutes, stops.length)` non-empty clusters.
 */
function _partitionIntoRoutes(stops, nRoutes) {
  var i;
  var q;
  var count = Math.min(nRoutes, stops.length);
  if (count <= 1) {
    return [stops.slice(0)];
  }

  var seedIdxs = [];
  var seed0 = 0;
  for (i = 1; i < stops.length; i++) {
    if (stops[i].riders > stops[seed0].riders) {
      seed0 = i;
    }
  }
  seedIdxs.push(seed0);

  while (seedIdxs.length < count) {
    var bestI = -1;
    var bestD = -1;
    for (i = 0; i < stops.length; i++) {
      var already = false;
      for (q = 0; q < seedIdxs.length; q++) {
        if (seedIdxs[q] === i) {
          already = true;
          break;
        }
      }
      if (already) {
        continue;
      }
      var minD = Infinity;
      for (q = 0; q < seedIdxs.length; q++) {
        var sIdx = seedIdxs[q];
        var d = _haversine(stops[i].latitude, stops[i].longitude, stops[sIdx].latitude, stops[sIdx].longitude);
        if (d < minD) {
          minD = d;
        }
      }
      if (minD > bestD) {
        bestD = minD;
        bestI = i;
      }
    }
    if (bestI < 0) {
      break;
    }
    seedIdxs.push(bestI);
  }

  var routeLists = [];
  for (i = 0; i < seedIdxs.length; i++) {
    routeLists.push([]);
  }
  for (i = 0; i < stops.length; i++) {
    var nearest = 0;
    var nd = Infinity;
    for (q = 0; q < seedIdxs.length; q++) {
      var si = seedIdxs[q];
      var dd = _haversine(stops[i].latitude, stops[i].longitude, stops[si].latitude, stops[si].longitude);
      if (dd < nd) {
        nd = dd;
        nearest = q;
      }
    }
    routeLists[nearest].push(stops[i]);
  }

  // Drop any empty cluster (possible when several stops share a seed location).
  var nonEmpty = [];
  for (i = 0; i < routeLists.length; i++) {
    if (routeLists[i].length > 0) {
      nonEmpty.push(routeLists[i]);
    }
  }
  return nonEmpty;
}

/* The dominant actual event destination for a cluster: argmax weight across its stops' destMaps. */
function _routeDestination(stops) {
  var agg = {};
  var order = [];
  var i;
  for (i = 0; i < stops.length; i++) {
    var dm = stops[i].destMap;
    var keys = Object.keys(dm);
    var k;
    for (k = 0; k < keys.length; k++) {
      var d = dm[keys[k]];
      var a = agg[d.key];
      if (a === undefined) {
        agg[d.key] = { key: d.key, name: d.name, latitude: d.latitude, longitude: d.longitude, weight: d.weight };
        order.push(d.key);
      } else {
        var nw = a.weight + d.weight;
        a.weight = nw;
      }
    }
  }
  var best = null;
  var i2;
  for (i2 = 0; i2 < order.length; i2++) {
    var c = agg[order[i2]];
    if (best === null || c.weight > best.weight) {
      best = c;
    }
  }
  return best;
}

/*
 * Allocate `nBuses` vehicles across routes. Each route gets at least one vehicle in descending
 * demand order while vehicles remain; any surplus goes greedily to the route with the highest
 * demand-per-vehicle ratio. Routes left with zero vehicles have their demand reported as unserved
 * rather than implying unlimited repeat trips. Returns an int[] alloc aligned with `routes`.
 */
function _allocateVehicles(routes, nBuses) {
  var alloc = [];
  var i;
  for (i = 0; i < routes.length; i++) {
    alloc.push(0);
  }
  // Routes in descending demand order.
  var order = [];
  for (i = 0; i < routes.length; i++) {
    order.push(i);
  }
  order.sort(function (a, b) {
    return routes[b].demand - routes[a].demand;
  });

  var left = nBuses;
  var oi;
  for (oi = 0; oi < order.length && left > 0; oi++) {
    if (routes[order[oi]].demand > 0) {
      alloc[order[oi]] = 1;
      left = left - 1;
    }
  }
  while (left > 0) {
    var bestR = -1;
    var bestRatio = -1;
    for (i = 0; i < routes.length; i++) {
      if (routes[i].demand <= 0) {
        continue;
      }
      var ratio = routes[i].demand / (alloc[i] + 1);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestR = i;
      }
    }
    if (bestR < 0) {
      break;
    }
    alloc[bestR] = alloc[bestR] + 1;
    left = left - 1;
  }
  return alloc;
}

function generateNetwork(windowDays, numBuses, busCapacity, meanTimeToServiceMin, baselineRoutes) {
  var winDays = windowDays && windowDays > 0 ? windowDays : DEFAULT_NETWORK_WINDOW_DAYS;
  var nBuses = numBuses && numBuses > 0 ? Math.floor(numBuses) : 1;
  var busCap = busCapacity && busCapacity > 0 ? busCapacity : DEFAULT_BUS_CAPACITY;
  var targetWait =
    meanTimeToServiceMin && meanTimeToServiceMin > 0 ? meanTimeToServiceMin : DEFAULT_MEAN_TIME_TO_SERVICE_MIN;
  var transitShare = _transitShare();
  var targetStops = _targetStopsPerRoute(baselineRoutes);

  var nowMs = Date.now();
  var startWin = nowMs - 24 * 3600 * 1000;
  var endWin = nowMs + winDays * 24 * 3600 * 1000;

  var res = MergedEvent.fetch({ include: EVENT_INCLUDE, limit: 2000 });
  var objs = res && res.objs ? res.objs : [];

  var pickMap = {};
  var pickKeys = [];
  var startSum = 0;
  var startW = 0;
  var estimatedDemand = 0;
  var eventsConsidered = 0;
  var eventsUsed = 0;
  var eventsUnknownDemand = 0;
  var perEvent = [];
  var i;
  var j;

  for (i = 0; i < objs.length; i++) {
    var ev = objs[i];
    var sMs = _parseIso(ev.startTime);
    if (sMs === null || sMs < startWin || sMs > endWin) {
      continue;
    }
    eventsConsidered = eventsConsidered + 1;

    var venue = ev.venue;
    var vlat = venue && venue.latitude != null ? venue.latitude : ev.latitude;
    var vlng = venue && venue.longitude != null ? venue.longitude : ev.longitude;
    var vname = venue && venue.name ? venue.name : ev.locationName ? ev.locationName : ev.name;
    var vkey = venue && venue.id ? venue.id : vlat != null && vlng != null ? _coordKey(vlat, vlng) : 'dest_' + _slug(vname);

    // Attendance basis — never fabricate a figure; unknown demand is reported, not invented.
    var attendance = null;
    var attendanceBasis = 'unknown';
    if (ev.estimatedPopulation != null && ev.estimatedPopulation > 0) {
      attendance = ev.estimatedPopulation;
      attendanceBasis = 'estimatedPopulation';
    } else if (venue && venue.capacity != null && venue.capacity > 0) {
      attendance = venue.capacity;
      attendanceBasis = 'venueCapacity';
    }

    var inboundDemand = attendance != null ? Math.round(attendance * transitShare) : null;
    var outboundDemand = inboundDemand; // riders also depart after the event (mirror journey)

    var cands = ev.startStopCandidates || [];
    var validCands = 0;
    var sumScore = 0;
    for (j = 0; j < cands.length; j++) {
      var cc = cands[j];
      if (cc.latitude != null && cc.longitude != null) {
        validCands = validCands + 1;
        if (cc.score != null && cc.score > 0) {
          sumScore = sumScore + cc.score;
        }
      }
    }

    perEvent.push({
      eventId: ev.id,
      name: ev.name,
      venue: vname,
      startTime: ev.startTime,
      attendance: attendance != null ? Math.round(attendance) : null,
      attendanceBasis: attendanceBasis,
      transitShare: transitShare,
      inboundDemand: inboundDemand,
      outboundDemand: outboundDemand,
      originStops: validCands,
    });

    if (attendance == null) {
      eventsUnknownDemand = eventsUnknownDemand + 1;
    }
    if (validCands === 0 || inboundDemand == null || inboundDemand <= 0) {
      continue; // cannot place demand without origins or a demand estimate
    }

    eventsUsed = eventsUsed + 1;
    estimatedDemand = estimatedDemand + inboundDemand;
    startSum = startSum + sMs * inboundDemand;
    startW = startW + inboundDemand;

    for (j = 0; j < cands.length; j++) {
      var c = cands[j];
      if (c.latitude == null || c.longitude == null) {
        continue;
      }
      var share = sumScore > 0 && c.score != null && c.score > 0 ? c.score / sumScore : 1 / validCands;
      var riders = share * inboundDemand;
      var key = _coordKey(c.latitude, c.longitude);
      var ex = pickMap[key];
      if (!ex) {
        var created = {
          name: c.name,
          latSum: c.latitude * riders,
          lngSum: c.longitude * riders,
          weight: riders,
          destMap: {},
          destOrder: [],
        };
        pickMap[key] = created;
        pickKeys.push(key);
        ex = created;
      } else {
        var nWeight = ex.weight + riders;
        var nLatSum = ex.latSum + c.latitude * riders;
        var nLngSum = ex.lngSum + c.longitude * riders;
        ex.weight = nWeight;
        ex.latSum = nLatSum;
        ex.lngSum = nLngSum;
      }
      if (vlat != null && vlng != null) {
        _addDest(ex, vkey, vname, vlat, vlng, riders);
      }
    }
  }

  if (pickKeys.length === 0) {
    throw new Error(
      'No upcoming merged events with a demand estimate and start-stop candidates in the next ' +
        winDays +
        ' day(s). Run EventResolver.resolveAll first, or add attendance estimates.'
    );
  }

  // Consolidated distinct boarding stops (each a real ~100 m origin cluster, with a readable name).
  var consolidated = [];
  for (i = 0; i < pickKeys.length; i++) {
    var pm = pickMap[pickKeys[i]];
    consolidated.push({
      stop_id: 'stop_' + _slug(pm.name) + '_' + i,
      name: pm.name,
      latitude: pm.latSum / pm.weight,
      longitude: pm.lngSum / pm.weight,
      riders: pm.weight,
      destMap: pm.destMap,
    });
  }

  var meanStartMs = startW > 0 ? Math.round(startSum / startW) : nowMs + 24 * 3600 * 1000;

  // Choose a route count that targets ~targetStops useful stops per corridor.
  var numRoutes = Math.round(consolidated.length / targetStops);
  if (numRoutes < 1) {
    numRoutes = 1;
  }
  var clusters = _partitionIntoRoutes(consolidated, numRoutes);

  // Pre-compute per-cluster demand so vehicles can be allocated before scheduling.
  var routeStubs = [];
  for (i = 0; i < clusters.length; i++) {
    var cl = clusters[i];
    var dem = 0;
    var cj;
    for (cj = 0; cj < cl.length; cj++) {
      dem = dem + cl[cj].riders;
    }
    routeStubs.push({ demand: dem });
  }
  var alloc = _allocateVehicles(routeStubs, nBuses);

  var windowSec = SCHEDULE_WINDOW_MIN * 60;
  var routes = [];
  var totalAssigned = 0;
  var totalUnserved = 0;
  var stopsTotal = 0;
  var stopsServed = 0;
  var anyPreliminary = false;
  var vehicleCounter = 1;
  var vehiclesUsed = 0;
  var ri;

  for (ri = 0; ri < clusters.length; ri++) {
    var stops = clusters[ri].slice(0);
    var dest = _routeDestination(stops);
    if (dest === null) {
      dest = { key: 'dest_' + ri, name: 'Event destination', latitude: stops[0].latitude, longitude: stops[0].longitude, weight: 0 };
    }

    // Order boarding stops by distance to this route's destination, farthest first (inbound order).
    stops.sort(function (a, b) {
      var da = _haversine(a.latitude, a.longitude, dest.latitude, dest.longitude);
      var db = _haversine(b.latitude, b.longitude, dest.latitude, dest.longitude);
      return db - da;
    });

    var nodes = [];
    for (i = 0; i < stops.length; i++) {
      nodes.push({
        stop_id: stops[i].stop_id,
        name: stops[i].name,
        latitude: stops[i].latitude,
        longitude: stops[i].longitude,
        riders: stops[i].riders,
      });
    }
    nodes.push({ stop_id: dest.key, name: dest.name, latitude: dest.latitude, longitude: dest.longitude, riders: 0 });

    // Travel times (Google Directions; haversine fallback => schedule preliminary/unverified).
    var legSeconds = _googleLegSeconds(nodes);
    var basis = 'google_directions';
    var preliminary = false;
    if (legSeconds === null) {
      basis = 'haversine_estimate';
      preliminary = true;
      anyPreliminary = true;
      legSeconds = [];
      for (i = 1; i < nodes.length; i++) {
        var meters = _haversine(nodes[i - 1].latitude, nodes[i - 1].longitude, nodes[i].latitude, nodes[i].longitude);
        legSeconds.push({ seconds: Math.round(meters / AVG_BUS_SPEED_MPS), meters: Math.round(meters) });
      }
    }
    var cumSec = [];
    var running = 0;
    for (i = 0; i < legSeconds.length; i++) {
      running = running + legSeconds[i].seconds;
      cumSec.push(running);
    }
    var oneWaySec = running;

    var boardingStops = stops.length; // distinct boarding stops (destination excluded)
    var dwellTotalSec = DWELL_SEC_PER_STOP * boardingStops;
    // Full operating cycle: loaded run + dwell + turnaround + deadhead reposition back to stop 1.
    var repoSec = Math.round(_haversine(dest.latitude, dest.longitude, nodes[0].latitude, nodes[0].longitude) / AVG_BUS_SPEED_MPS);
    var cycleSec = oneWaySec + dwellTotalSec + TURNAROUND_SEC + repoSec;
    if (cycleSec < 60) {
      cycleSec = 60;
    }

    var routeDemand = 0;
    for (i = 0; i < stops.length; i++) {
      routeDemand = routeDemand + stops[i].riders;
    }
    routeDemand = Math.round(routeDemand);

    var vehiclesOnRoute = alloc[ri];
    var requiredRuns = Math.ceil(routeDemand / busCap);
    if (requiredRuns < 1 && routeDemand > 0) {
      requiredRuns = 1;
    }
    // One vehicle runs back-to-back cycles across the window => no overlapping assignments.
    var tripsPerVehicle = Math.floor(windowSec / cycleSec) + 1;
    if (tripsPerVehicle < 1) {
      tripsPerVehicle = 1;
    }
    var capacityRuns = vehiclesOnRoute * tripsPerVehicle;
    var scheduledRuns = requiredRuns < capacityRuns ? requiredRuns : capacityRuns;
    if (scheduledRuns > MAX_DEPARTURES_PER_ROUTE) {
      scheduledRuns = MAX_DEPARTURES_PER_ROUTE;
    }
    if (scheduledRuns < 0) {
      scheduledRuns = 0;
    }

    var capacityProvided = scheduledRuns * busCap;
    var assignedRiders = routeDemand < capacityProvided ? routeDemand : capacityProvided;
    var unservedRiders = routeDemand - assignedRiders;
    totalAssigned = totalAssigned + assignedRiders;
    totalUnserved = totalUnserved + unservedRiders;

    stopsTotal = stopsTotal + boardingStops;
    if (scheduledRuns > 0) {
      stopsServed = stopsServed + boardingStops;
    }
    vehiclesUsed = vehiclesUsed + vehiclesOnRoute;

    // Vehicle roster (ids + capacity). One vehicle serves only this route (no overlap possible).
    var vehicles = [];
    var vIdx;
    for (vIdx = 0; vIdx < vehiclesOnRoute; vIdx++) {
      vehicles.push({ vehicleId: 'bus_' + vehicleCounter, capacity: busCap });
      vehicleCounter = vehicleCounter + 1;
    }

    // Schedule: spread scheduledRuns departures across the pre-peak window so the last run reaches
    // the destination by the demand-weighted mean event start.
    var arrivalOffsetSec = oneWaySec + dwellTotalSec;
    var lastDepMs = meanStartMs - arrivalOffsetSec * 1000;
    var headwayMin;
    var departureMs = [];
    if (scheduledRuns <= 1) {
      headwayMin = _round1(2 * targetWait);
      if (scheduledRuns === 1) {
        departureMs.push(lastDepMs);
      }
    } else {
      var spanSec = windowSec;
      var stepSec = spanSec / (scheduledRuns - 1);
      headwayMin = _round1(stepSec / 60);
      if (headwayMin < 2) {
        headwayMin = 2;
      }
      var firstDepMs = lastDepMs - spanSec * 1000;
      for (i = 0; i < scheduledRuns; i++) {
        departureMs.push(Math.round(firstDepMs + stepSec * 1000 * i));
      }
    }
    var departureTimes = [];
    for (i = 0; i < departureMs.length; i++) {
      departureTimes.push(_fmtIso(departureMs[i]));
    }

    // Downstream stops with per-departure arrival times, aligned 1:1 with departureTimes.
    var destinations = [];
    var legsPlan = [];
    var orderedStopsOut = [];
    var assignFrac = routeDemand > 0 ? assignedRiders / routeDemand : 0;
    orderedStopsOut.push({
      stop_id: nodes[0].stop_id,
      name: nodes[0].name,
      latitude: nodes[0].latitude,
      longitude: nodes[0].longitude,
      demand: Math.round(nodes[0].riders),
      assigned: Math.round(nodes[0].riders * assignFrac),
    });
    var di;
    for (di = 1; di < nodes.length; di++) {
      var node = nodes[di];
      var arrTimes = [];
      var cumWithDwell = cumSec[di - 1] + DWELL_SEC_PER_STOP * di;
      var k;
      for (k = 0; k < departureMs.length; k++) {
        arrTimes.push(_fmtIso(departureMs[k] + cumWithDwell * 1000));
      }
      destinations.push({ stop_id: node.stop_id, name: node.name, arrival_times: arrTimes });
      legsPlan.push({
        from: nodes[di - 1].name,
        to: node.name,
        minutes: _round1(legSeconds[di - 1].seconds / 60),
        meters: legSeconds[di - 1].meters,
      });
      orderedStopsOut.push({
        stop_id: node.stop_id,
        name: node.name,
        latitude: node.latitude,
        longitude: node.longitude,
        demand: Math.round(node.riders),
        assigned: di === nodes.length - 1 ? assignedRiders : Math.round(node.riders * assignFrac),
      });
    }

    var roundTripMin = _round1(cycleSec / 60);
    var shortNote = null;
    if (boardingStops < MIN_STOPS_PER_ROUTE) {
      shortNote =
        'Shorter than the ~' +
        targetStops +
        '-stop target: only ' +
        boardingStops +
        ' distinct demand stop(s) exist in this corridor.';
    }

    routes.push({
      routeId: 'route_' + (ri + 1),
      routeName: 'Proposed route ' + (ri + 1) + ' → ' + dest.name,
      proposed: true,
      direction: 'inbound',
      startStopId: nodes[0].stop_id,
      pickupStop: { stop_id: nodes[0].stop_id, name: nodes[0].name },
      destinationStop: { stop_id: dest.key, name: dest.name },
      orderedStops: orderedStopsOut,
      stopCount: boardingStops,
      totalSequenceStops: boardingStops + 1,
      vehicles: vehicles,
      vehicleCount: vehiclesOnRoute,
      departure_times: departureTimes,
      destinations: destinations,
      estimatedDemand: routeDemand,
      assignedRiders: assignedRiders,
      unservedRiders: unservedRiders,
      requiredRuns: requiredRuns,
      scheduledRuns: scheduledRuns,
      headwayMin: headwayMin,
      oneWayMin: _round1(oneWaySec / 60),
      roundTripMin: roundTripMin,
      travelBasis: basis,
      estimationConfidence: preliminary ? 'preliminary' : 'verified',
      schedulePreliminary: preliminary,
      legs: legsPlan,
      note: shortNote,
    });
  }

  // Sort routes by demand (most-demanded corridor first) for display; renumber kept via routeId.
  routes.sort(function (a, b) {
    return b.estimatedDemand - a.estimatedDemand;
  });

  var baselineKeys = baselineRoutes ? Object.keys(baselineRoutes) : [];
  var baselineHeadway = _baselineMedianHeadwayMin(baselineRoutes);
  var passengerServicePct = estimatedDemand > 0 ? _round1((totalAssigned / estimatedDemand) * 100) : 0;
  var locationCoveragePct = stopsTotal > 0 ? _round1((stopsServed / stopsTotal) * 100) : 0;

  var plan = {
    window: { days: winDays, from: _fmtIso(startWin), to: _fmtIso(endWin) },
    demand: {
      eventsConsidered: eventsConsidered,
      eventsUsed: eventsUsed,
      eventsUnknownDemand: eventsUnknownDemand,
      estimatedDemand: Math.round(estimatedDemand),
      transitShare: transitShare,
      meanEventStart: _fmtIso(meanStartMs),
      originStops: consolidated.length,
      perEvent: perEvent,
    },
    fleet: {
      requested: nBuses,
      used: vehiclesUsed,
      busCapacity: busCap,
      meanTimeToServiceMin: targetWait,
      targetStopsPerRoute: targetStops,
      routeCount: routes.length,
    },
    coverage: {
      estimatedDemand: Math.round(estimatedDemand),
      assignedRiders: Math.round(totalAssigned),
      unservedRiders: Math.round(totalUnserved),
      passengerServicePct: passengerServicePct,
      stopsTotal: stopsTotal,
      stopsServed: stopsServed,
      locationCoveragePct: locationCoveragePct,
    },
    schedule: {
      status: anyPreliminary ? 'preliminary' : 'verified',
      travelBasis: anyPreliminary ? 'haversine_estimate' : 'google_directions',
      note: anyPreliminary
        ? 'At least one route uses haversine/average-speed estimates (no Google Directions key); schedules are preliminary and feasibility is unverified.'
        : 'Travel times from Google Directions.',
    },
    baselineComparison: {
      knownStartStops: baselineKeys,
      baselineMedianHeadwayMin: baselineHeadway,
      note:
        baselineHeadway !== null
          ? 'Baseline median headway ' + baselineHeadway + ' min; compare against each new route headway.'
          : 'No baseline route cadence supplied for comparison.',
    },
    outboundNote:
      'Demand figures cover the inbound (to-event) journey; an equal outbound surge departs after the event and reuses these corridors in reverse.',
  };

  return { routes: routes, plan: plan };
}
