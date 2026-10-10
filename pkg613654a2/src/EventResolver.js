/**
 * EventResolver pipeline — see EventResolver.c3typ for the method contracts.
 *
 * All scoring is transparent mathematical heuristics so results are explainable and testable.
 * `_`-prefixed top-level functions are module-local helpers, not C3 methods.
 */

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------
var SIM_THRESHOLD = 0.72; // pairwise similarity above which two events are the same
var W_NAME = 0.5;
var W_TIME = 0.3;
var W_LOC = 0.2;
var END_RADIUS_M = 1200; // bus stops near the venue (drop-off)
var START_RADIUS_M = 4000; // origins (park-and-ride / parking / population centers)
var CATEGORY_LOAD = {
  Sports: 0.9, Concert: 0.85, Arts: 0.7, Conference: 0.6, Social: 0.5, Academic: 0.4, Other: 0.3,
};
var CATEGORY_PRIOR = { Sports: 500, Concert: 400, Arts: 200, Conference: 150, Social: 120, Academic: 80, Other: 100 };
var FIELDS_TEXT_LONGEST = { description: true };

// ---------------------------------------------------------------------------
// String / geo helpers
// ---------------------------------------------------------------------------
function _norm(s) {
  if (s == null) return '';
  return ('' + s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|a|an|vs|at|of|and|for|to)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Trigram Dice coefficient — fuzzy name similarity tolerant of small spelling differences.
function _trigramDice(a, b) {
  var na = _norm(a);
  var nb = _norm(b);
  if (!na && !nb) return 0;
  if (na === nb) return 1;
  var ga = _trigrams(na);
  var gb = _trigrams(nb);
  var lenA = ga.length;
  var lenB = gb.length;
  if (lenA === 0 || lenB === 0) return 0;
  var setB = {};
  var key;
  var cur;
  for (var i = 0; i < lenB; i++) {
    key = gb[i];
    cur = setB[key];
    if (cur === undefined) { cur = 0; }
    setB[key] = cur + 1;
  }
  var inter = 0;
  for (var j = 0; j < lenA; j++) {
    key = ga[j];
    cur = setB[key];
    if (cur === undefined) { cur = 0; }
    if (cur > 0) {
      inter = inter + 1;
      setB[key] = cur - 1;
    }
  }
  return (2 * inter) / (lenA + lenB);
}

function _trigrams(s) {
  var padded = '  ' + s + '  ';
  var out = [];
  for (var i = 0; i < padded.length - 2; i++) out.push(padded.substring(i, i + 3));
  return out;
}

function _haversine(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toRad = function (d) { return (d * Math.PI) / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ---------------------------------------------------------------------------
// Raw-event accessors (events fetched with venue.* included)
// ---------------------------------------------------------------------------
function _dtString(dt) { return dt == null ? '' : ('' + dt); }
function _dayKey(dt) { var d = _dtString(dt).replace(/[^0-9]/g, ''); return d.length >= 8 ? d.substring(0, 8) : ''; }
function _minuteOfDay(dt) {
  var s = _dtString(dt);
  var t = s.indexOf('T');
  if (t < 0) return 0;
  var hh = parseInt(s.substring(t + 1, t + 3), 10);
  var mm = parseInt(s.substring(t + 4, t + 6), 10);
  if (isNaN(hh)) hh = 0;
  if (isNaN(mm)) mm = 0;
  return hh * 60 + mm;
}
function _evLat(e) { return (e.venue && e.venue.latitude != null) ? e.venue.latitude : e.latitude; }
function _evLng(e) { return (e.venue && e.venue.longitude != null) ? e.venue.longitude : e.longitude; }
function _evLoc(e) { return (e.venue && e.venue.name) ? e.venue.name : (e.locationName || ''); }

// ---------------------------------------------------------------------------
// Pairwise similarity
// ---------------------------------------------------------------------------
function _similarity(a, b) {
  var nameS = _trigramDice(a.name, b.name);

  var dtA = _minuteOfDay(a.startTime);
  var dtB = _minuteOfDay(b.startTime);
  var diffMin = Math.abs(dtA - dtB);
  var timeS = Math.max(0, 1 - diffMin / (12 * 60));

  var locS;
  if (a.venue && b.venue && a.venue.id && a.venue.id === b.venue.id) {
    locS = 1;
  } else if (_evLat(a) != null && _evLat(b) != null) {
    var d = _haversine(_evLat(a), _evLng(a), _evLat(b), _evLng(b));
    locS = Math.max(0, 1 - d / 500);
  } else if (_evLoc(a) && _evLoc(b)) {
    locS = _trigramDice(_evLoc(a), _evLoc(b));
  } else {
    locS = 0.5; // one side has no location — stay neutral
  }

  return W_NAME * nameS + W_TIME * timeS + W_LOC * locS;
}

// ---------------------------------------------------------------------------
// Union-find clustering within one day-block
// ---------------------------------------------------------------------------
function _cluster(events) {
  var n = events.length;
  var parent = [];
  for (var i = 0; i < n; i++) parent[i] = i;
  var find = function (x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  var union = function (a, b) { var ra = find(a); var rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (var p = 0; p < n; p++) {
    for (var q = p + 1; q < n; q++) {
      if (_similarity(events[p], events[q]) >= SIM_THRESHOLD) union(p, q);
    }
  }
  var groups = {};
  for (var k = 0; k < n; k++) {
    var r = find(k);
    if (!groups[r]) groups[r] = [];
    groups[r].push(events[k]);
  }
  var out = [];
  for (var g in groups) { if (groups.hasOwnProperty(g)) out.push(groups[g]); }
  return out;
}

// ---------------------------------------------------------------------------
// Reputation
// ---------------------------------------------------------------------------
function _credibility(e, corroborated) {
  var keyFields = [e.name, e.startTime, e.endTime, (e.venue || e.locationName), e.category, e.expectedAttendance, e.description];
  var present = 0;
  for (var i = 0; i < keyFields.length; i++) if (keyFields[i] != null && keyFields[i] !== '') present++;
  var completeness = present / keyFields.length;

  var attempted = 0, passed = 0;
  if (e.endTime != null) {
    attempted += 2;
    var dur = _minuteOfDay(e.endTime) - _minuteOfDay(e.startTime);
    if (dur > 0) passed++;
    if (dur >= 15 && dur <= 720) passed++;
  }
  if (e.expectedAttendance != null) {
    attempted++;
    var cap = (e.venue && e.venue.capacity != null) ? e.venue.capacity : null;
    if (e.expectedAttendance >= 0 && (cap == null || e.expectedAttendance <= cap * 1.2)) passed++;
  }
  var consistency = attempted === 0 ? 0.7 : passed / attempted;

  var attOk = (e.expectedAttendance == null) || (e.expectedAttendance >= 1 && e.expectedAttendance <= 70000);
  var nameOk = (e.name && ('' + e.name).length >= 4);
  var plausibility = ((attOk ? 1 : 0) + (nameOk ? 1 : 0)) / 2;

  var corr = corroborated ? 1.0 : 0.5;

  var score = 0.30 * completeness + 0.30 * consistency + 0.20 * plausibility + 0.20 * corr;
  score = Math.max(0, Math.min(1, score));
  var basis = 'manual credibility = 0.30×completeness(' + completeness.toFixed(2) +
    ') + 0.30×consistency(' + consistency.toFixed(2) + ') + 0.20×plausibility(' +
    plausibility.toFixed(2) + ') + 0.20×corroboration(' + corr.toFixed(2) + ')';
  return { score: score, basis: basis };
}

function _rawReputation(e, corroborated, relMap) {
  if (e.source === 'Manual') {
    return _credibility(e, corroborated);
  }
  var rel = relMap['uiuc_calendar'] != null ? relMap['uiuc_calendar'] : 0.85;
  return { score: rel, basis: 'scraped source reliability (uiuc_calendar) = ' + rel.toFixed(2) };
}

function _noisyOr(reps) {
  var prod = 1;
  for (var i = 0; i < reps.length; i++) prod *= (1 - Math.max(0, Math.min(1, reps[i])));
  return 1 - prod;
}

// ---------------------------------------------------------------------------
// Field selection with provenance
// ---------------------------------------------------------------------------
function _pickField(field, events, repById, valueFn) {
  var cands = [];
  for (var i = 0; i < events.length; i++) {
    var v = valueFn(events[i]);
    if (v != null && v !== '') {
      cands.push({ value: v, source: events[i].source, sourceEventId: events[i].id, reputation: repById[events[i].id] });
    }
  }
  if (cands.length === 0) return null;
  var longest = FIELDS_TEXT_LONGEST[field] === true;
  cands.sort(function (a, b) {
    if (longest) {
      var la = ('' + a.value).length, lb = ('' + b.value).length;
      if (lb !== la) return lb - la;
      return b.reputation - a.reputation;
    }
    if (b.reputation !== a.reputation) return b.reputation - a.reputation;
    return ('' + b.value).length - ('' + a.value).length;
  });
  var distinct = {};
  for (var k = 0; k < cands.length; k++) distinct['' + cands[k].value] = true;
  var alts = [];
  for (var j = 1; j < cands.length; j++) {
    if (('' + cands[j].value) !== ('' + cands[0].value)) {
      alts.push({ value: cands[j].value, source: cands[j].source, sourceEventId: cands[j].sourceEventId, reputation: cands[j].reputation });
    }
  }
  var countDistinct = 0; for (var d in distinct) if (distinct.hasOwnProperty(d)) countDistinct++;
  return {
    winner: cands[0],
    provenance: {
      value: cands[0].value, source: cands[0].source, sourceEventId: cands[0].sourceEventId,
      reputation: cands[0].reputation, alternatives: alts,
    },
    conflict: countDistinct > 1,
  };
}

// ---------------------------------------------------------------------------
// Population estimate (reputation-weighted)
// ---------------------------------------------------------------------------
function _population(events, repById, chosenVenue, chosenCategory) {
  var num = 0, den = 0, n = 0;
  for (var i = 0; i < events.length; i++) {
    if (events[i].expectedAttendance != null) {
      var r = repById[events[i].id];
      num += r * events[i].expectedAttendance;
      den += r;
      n++;
    }
  }
  if (den > 0) {
    return { value: Math.round(num / den), basis: 'reputation-weighted mean of ' + n + ' reported value(s)' };
  }
  if (chosenVenue && chosenVenue.capacity != null) {
    var f = CATEGORY_LOAD[chosenCategory] != null ? CATEGORY_LOAD[chosenCategory] : 0.5;
    return {
      value: Math.round(chosenVenue.capacity * f),
      basis: 'inferred: venue capacity (' + chosenVenue.capacity + ') × ' + (chosenCategory || 'Other') + ' load factor (' + f + ')',
    };
  }
  var prior = CATEGORY_PRIOR[chosenCategory] != null ? CATEGORY_PRIOR[chosenCategory] : 100;
  return { value: prior, basis: 'category prior (' + (chosenCategory || 'Other') + '); no reported attendance or venue capacity' };
}

// ---------------------------------------------------------------------------
// Start / end stop candidates
// ---------------------------------------------------------------------------
function _stops(lat, lng, stops) {
  var start = [], end = [];
  if (lat == null || lng == null) return { start: start, end: end };

  // End = venue centroid + nearby bus stops (drop-off).
  end.push({ method: 'venue_centroid', name: 'Event venue', latitude: lat, longitude: lng, distanceMeters: 0, score: 1, stopType: 'Venue' });
  for (var i = 0; i < stops.length; i++) {
    var s = stops[i];
    var dist = _haversine(lat, lng, s.latitude, s.longitude);
    if (s.stopType === 'BusStop' && dist <= END_RADIUS_M) {
      end.push({ method: 'nearest_transit', name: s.name, latitude: s.latitude, longitude: s.longitude,
        distanceMeters: Math.round(dist), score: +(1 - dist / END_RADIUS_M).toFixed(3), stopType: s.stopType });
    }
    if ((s.stopType === 'ParkAndRide' || s.stopType === 'ParkingArea' || s.stopType === 'PopulationCenter') && dist <= START_RADIUS_M) {
      var methodMap = { ParkAndRide: 'park_and_ride', ParkingArea: 'parking', PopulationCenter: 'population_center' };
      var wNorm = s.weight != null ? Math.min(1, s.weight / 5000) : 0.3;
      var score = +((0.6 * (1 - dist / START_RADIUS_M)) + 0.4 * wNorm).toFixed(3);
      start.push({ method: methodMap[s.stopType], name: s.name, latitude: s.latitude, longitude: s.longitude,
        distanceMeters: Math.round(dist), score: score, stopType: s.stopType });
    }
  }
  end.sort(function (a, b) { return b.score - a.score; });
  start.sort(function (a, b) { return b.score - a.score; });
  return { start: start.slice(0, 6), end: end.slice(0, 6) };
}

// ---------------------------------------------------------------------------
// Merge one cluster into a MergedEvent make-object (+ raw-event updates)
// ---------------------------------------------------------------------------
function _mergeCluster(events, stops, relMap, dayKey, idx) {
  // Per-event reputation (corroborated if the cluster spans >1 distinct source).
  var sources = {};
  for (var i = 0; i < events.length; i++) sources[events[i].source] = true;
  var multiSource = (function () { var c = 0; for (var s in sources) if (sources.hasOwnProperty(s)) c++; return c > 1; })();

  var repById = {}, repList = [], repBasis = [];
  for (var e = 0; e < events.length; e++) {
    var rr = _rawReputation(events[e], multiSource, relMap);
    repById[events[e].id] = rr.score;
    repList.push(rr.score);
    repBasis.push(events[e].id + '=' + rr.score.toFixed(2));
  }

  var prov = {};
  var conflicts = 0, considered = 0;
  var pick = function (field, fn) {
    var p = _pickField(field, events, repById, fn);
    if (p) { prov[field] = p.provenance; considered++; if (p.conflict) conflicts++; }
    return p ? p.winner.value : null;
  };

  var name = pick('name', function (e) { return e.name; });
  var startTime = pick('startTime', function (e) { return e.startTime; });
  var endTime = pick('endTime', function (e) { return e.endTime; });
  var locationName = pick('locationName', function (e) { return e.locationName; });
  var category = pick('category', function (e) { return e.category; });
  var status = pick('status', function (e) { return e.status; });
  var description = pick('description', function (e) { return e.description; });
  pick('expectedAttendance', function (e) { return e.expectedAttendance; });
  var latitude = pick('latitude', function (e) { return _evLat(e); });
  var longitude = pick('longitude', function (e) { return _evLng(e); });

  // Venue (reference): pick by reputation among events that have one.
  var venuePick = _pickField('venue', events, repById, function (e) { return (e.venue && e.venue.id) ? e.venue.id : null; });
  var chosenVenue = null;
  if (venuePick) {
    prov['venue'] = venuePick.provenance;
    considered++;
    if (venuePick.conflict) conflicts++;
    for (var v = 0; v < events.length; v++) {
      if (events[v].venue && events[v].venue.id === venuePick.winner.value) { chosenVenue = events[v].venue; break; }
    }
  }

  var conflictRate = considered > 0 ? conflicts / considered : 0;
  var noisy = _noisyOr(repList);
  var reputationScore = Math.max(0, Math.min(1, noisy - 0.15 * conflictRate));
  var reputationBasis = 'noisy-OR over [' + repBasis.join(', ') + '] = ' + noisy.toFixed(3) +
    '; conflict rate ' + conflictRate.toFixed(2) + ' → penalty ' + (0.15 * conflictRate).toFixed(3);

  var pop = _population(events, repById, chosenVenue, category);

  var lat = (chosenVenue && chosenVenue.latitude != null) ? chosenVenue.latitude : latitude;
  var lng = (chosenVenue && chosenVenue.longitude != null) ? chosenVenue.longitude : longitude;
  var stopSets = _stops(lat, lng, stops);

  var mergedId = 'merged_' + dayKey + '_' + idx;
  var now = DateTime.now();

  var merged = MergedEvent.make({
    id: mergedId,
    name: name,
    description: description,
    startTime: startTime,
    endTime: endTime,
    venue: chosenVenue ? { id: chosenVenue.id } : null,
    locationName: locationName,
    latitude: latitude,
    longitude: longitude,
    category: category,
    status: status || 'Scheduled',
    reputationScore: +reputationScore.toFixed(4),
    reputationBasis: reputationBasis,
    estimatedPopulation: pop.value,
    populationBasis: pop.basis,
    sourceCount: (function () { var c = 0; for (var s2 in sources) if (sources.hasOwnProperty(s2)) c++; return c; })(),
    fieldProvenance: _serializeProv(prov),
    startStopCandidates: stopSets.start,
    endStopCandidates: stopSets.end,
    clusterKey: dayKey,
    lastResolvedAt: now,
  });

  var rawUpdates = [];
  for (var u = 0; u < events.length; u++) {
    var rb = events[u].source === 'Manual' ? _credibility(events[u], multiSource).basis
      : 'scraped source reliability';
    rawUpdates.push(CampusEvent.make({
      id: events[u].id,
      mergedEvent: { id: mergedId },
      reputationScore: +repById[events[u].id].toFixed(4),
      credibilityBasis: rb,
    }));
  }

  return { merged: merged, rawUpdates: rawUpdates };
}

// datetimes in provenance must be serialized to strings for JSON storage
function _serializeProv(prov) {
  var out = {};
  for (var f in prov) {
    if (!prov.hasOwnProperty(f)) continue;
    var p = prov[f];
    var ser = function (x) { return (x && x.toString && typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean') ? ('' + x) : x; };
    var alts = [];
    for (var a = 0; a < (p.alternatives || []).length; a++) {
      var al = p.alternatives[a];
      alts.push({ value: ser(al.value), source: al.source, sourceEventId: al.sourceEventId, reputation: al.reputation });
    }
    out[f] = { value: ser(p.value), source: p.source, sourceEventId: p.sourceEventId, reputation: p.reputation, alternatives: alts };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared loaders
// ---------------------------------------------------------------------------
function _loadStops() {
  var res = TransitStop.fetch({ limit: 500, offset: 0 });
  var arr = [];
  (res.objs || []).map(function (s) { arr.push(s); return s; });
  return arr;
}
function _relMap() {
  var res = EventFeed.fetch({ limit: 100, offset: 0 });
  var map = {};
  (res.objs || []).map(function (s) {
    map[s.id] = s.reliabilityScore != null ? s.reliabilityScore : s.baseReliability;
    return s;
  });
  return map;
}
var EVENT_INCLUDE = 'this, venue.id, venue.name, venue.latitude, venue.longitude, venue.capacity';

// ---------------------------------------------------------------------------
// recomputeSourceReliability
// ---------------------------------------------------------------------------
function recomputeSourceReliability() {
  var res = EventFeed.fetch({ limit: 100, offset: 0 });
  var now = DateTime.now();
  var updates = [];
  var summary = [];
  (res.objs || []).map(function (src) {
    var score;
    if (src.sourceType === 'Scraped') {
      var staleDays = src.lastObservedAt != null ? Math.max(0, DateTime.deltaSeconds(src.lastObservedAt, now) / 86400) : 0;
      var freshness = Math.max(0.7, 1 - 0.1 * staleDays); // -10%/day, floor 0.7
      var corrRate = (src.eventsObserved && src.eventsObserved > 0) ? (src.corroboratedCount || 0) / src.eventsObserved : 0;
      var corrFactor = 0.9 + 0.1 * Math.min(1, corrRate * 3); // small upward nudge from corroboration
      score = Math.max(0.6, Math.min(0.95, src.baseReliability * freshness * corrFactor));
      var basis = 'base ' + src.baseReliability.toFixed(2) + ' × freshness ' + freshness.toFixed(2) +
        ' × corroboration ' + corrFactor.toFixed(2) + ' (clamped 0.60–0.95)';
      updates.push(EventFeed.make({ id: src.id, reliabilityScore: +score.toFixed(4), reliabilityBasis: basis }));
    } else {
      score = src.baseReliability;
      updates.push(EventFeed.make({ id: src.id, reliabilityScore: +score.toFixed(4), reliabilityBasis: 'manual: scored per entry at merge time' }));
    }
    summary.push({ id: src.id, reliabilityScore: +score.toFixed(4) });
    return src;
  });
  if (updates.length > 0) EventFeed.mergeBatch(updates);
  return { updated: updates.length, sources: summary };
}

// ---------------------------------------------------------------------------
// resolveAll — the daily pipeline
// ---------------------------------------------------------------------------
function resolveAll(windowDays) {
  if (windowDays == null || windowDays <= 0) windowDays = 30;
  recomputeSourceReliability();

  var relMap = _relMap();
  var stops = _loadStops();

  var startIso = DateTime.now().minusDays(1).format("yyyy-MM-dd'T'HH:mm:ss");
  var endIso = DateTime.now().plusDays(windowDays).format("yyyy-MM-dd'T'HH:mm:ss");
  var filter = "startTime >= '" + startIso + "' && startTime <= '" + endIso + "'";

  var res = CampusEvent.fetch({ filter: filter, include: EVENT_INCLUDE, limit: 2000, offset: 0, order: 'startTime' });
  var events = [];
  (res.objs || []).map(function (e) { events.push(e); return e; });

  // Clear stale merged events in the window (rebuild from scratch).
  MergedEvent.removeAll({ filter: filter }, true);

  // Block by calendar day, then cluster within each block.
  var blocks = {};
  for (var i = 0; i < events.length; i++) {
    var dk = _dayKey(events[i].startTime);
    if (!dk) continue;
    if (!blocks[dk]) blocks[dk] = [];
    blocks[dk].push(events[i]);
  }

  var mergedBatch = [];
  var rawBatch = [];
  var clusterCount = 0;
  var scrapedObserved = 0;
  var scrapedCorroborated = 0;
  for (var dk2 in blocks) {
    if (!blocks.hasOwnProperty(dk2)) continue;
    var clusters = _cluster(blocks[dk2]);
    for (var c = 0; c < clusters.length; c++) {
      var cl = clusters[c];
      // A scraped event is "corroborated" when its cluster also contains an event from
      // a different source.
      var hasOther = false;
      for (var m = 0; m < cl.length; m++) { if (cl[m].source !== 'Scraped') { hasOther = true; break; } }
      for (var s = 0; s < cl.length; s++) {
        if (cl[s].source === 'Scraped') { scrapedObserved++; if (hasOther) scrapedCorroborated++; }
      }
      var r = _mergeCluster(cl, stops, relMap, dk2, c);
      mergedBatch.push(r.merged);
      for (var ru = 0; ru < r.rawUpdates.length; ru++) rawBatch.push(r.rawUpdates[ru]);
      clusterCount++;
    }
  }

  if (mergedBatch.length > 0) MergedEvent.mergeBatch(mergedBatch);
  if (rawBatch.length > 0) CampusEvent.mergeBatch(rawBatch);

  // Record this window's observation snapshot on the scraped feed so the next
  // recomputeSourceReliability sees fresh timestamps and the current corroboration rate.
  EventFeed.mergeBatch([EventFeed.make({
    id: 'uiuc_calendar',
    eventsObserved: scrapedObserved,
    corroboratedCount: scrapedCorroborated,
    lastObservedAt: DateTime.now(),
  })]);

  return {
    rawEvents: events.length, clusters: clusterCount, merged: mergedBatch.length,
    scrapedObserved: scrapedObserved, scrapedCorroborated: scrapedCorroborated, windowDays: windowDays,
  };
}

// ---------------------------------------------------------------------------
// scoreManualEvent — incremental, between daily scrapes
// ---------------------------------------------------------------------------
function scoreManualEvent(eventId) {
  var res = CampusEvent.fetch({ filter: "id == '" + eventId + "'", include: EVENT_INCLUDE, limit: 1, offset: 0 });
  var list = [];
  (res.objs || []).map(function (e) { list.push(e); return e; });
  if (list.length === 0) return { eventId: eventId, error: 'not found' };
  var ev = list[0];
  var dayKey = _dayKey(ev.startTime);
  var relMap = _relMap();
  var stops = _loadStops();

  // Candidate same-day events (any source) that might be the same real event.
  var dayStart = ('' + ev.startTime).substring(0, 10) + 'T00:00:00';
  var dayEnd = ('' + ev.startTime).substring(0, 10) + 'T23:59:59';
  var dayRes = CampusEvent.fetch({
    filter: "startTime >= '" + dayStart + "' && startTime <= '" + dayEnd + "'",
    include: EVENT_INCLUDE, limit: 500, offset: 0,
  });
  var sameDay = [];
  (dayRes.objs || []).map(function (e) { sameDay.push(e); return e; });

  // Collect the cluster: this event + everything similar to it on the day.
  var cluster = [ev];
  var seen = {}; seen[ev.id] = true;
  for (var i = 0; i < sameDay.length; i++) {
    if (seen[sameDay[i].id]) continue;
    if (_similarity(ev, sameDay[i]) >= SIM_THRESHOLD) { cluster.push(sameDay[i]); seen[sameDay[i].id] = true; }
  }
  var matched = cluster.length > 1;

  // Reuse the shared merge path so the manual entry participates identically to a daily resolve.
  var merge = _mergeCluster(cluster, stops, relMap, dayKey, 'inc_' + eventId.replace(/[^a-zA-Z0-9]/g, '_'));
  MergedEvent.mergeBatch([merge.merged]);
  CampusEvent.mergeBatch(merge.rawUpdates);

  var cred = _credibility(ev, matched);
  return {
    eventId: eventId,
    reputationScore: +cred.score.toFixed(4),
    credibilityBasis: cred.basis,
    mergedEventId: merge.merged.id,
    matched: matched,
  };
}
