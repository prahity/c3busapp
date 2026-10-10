/*
 * RouteNetworkSimBridge — maps the campus bus-route planner's output into a scenario-scoped
 * SurgePlanner (SimRunner) simulation input, then validates / optionally runs it.
 *
 * The simulator subsystem is entirely scenario-scoped: SimInputAssembler.assemble(scenarioId) and
 * every adapter read records by Filter.eq('scenarioId', scenarioId). So the clean integration never
 * touches the simulator — it authors a SimScenario plus the scenario-scoped SimStop / SimEvent /
 * SimExtraBus / SimTravelLink records the adapters expect, then runs SimRunner unchanged.
 *
 * Rhino-safe style throughout: explicit intermediate vars (no compound property ops), index loops
 * over C3 json arrays, native JS arrays built in-method for the output.
 */

var BRIDGE_CONTRACT_VERSION = 'sim-contract-1.0.0';
var BRIDGE_SYNTH_LABEL =
  'SIMULATED - demand & stops derived from scraped campus events and the bus-route planner, ' +
  'not live MTD operational data';
var BRIDGE_DEADHEAD_KMH = 22; // matches SimAssumptions.deadheadSpeedKmPerHour below
var BRIDGE_RANDOM_SEED = 1337;

/* ------------------------------------------------------------------ helpers */

function _posInt(v, dflt) {
  if (v === null || v === undefined) {
    return dflt;
  }
  var n = Math.floor(v);
  if (!(n > 0)) {
    return dflt;
  }
  return n;
}

function _posNum(v, dflt) {
  if (v === null || v === undefined) {
    return dflt;
  }
  var n = v * 1.0;
  if (!(n > 0)) {
    return dflt;
  }
  return n;
}

function _round5(x) {
  return Math.round(x * 100000) / 100000;
}

function _round2(x) {
  return Math.round(x * 100) / 100;
}

function _coordKey(la, lo) {
  return _round5(la) + ',' + _round5(lo);
}

/* Milliseconds since epoch for a datetime string/value, or null when unparseable. */
function _msOf(v) {
  if (v === null || v === undefined) {
    return null;
  }
  var ms = new Date(v).getTime();
  if (isNaN(ms)) {
    ms = new Date('' + v).getTime();
  }
  if (isNaN(ms)) {
    return null;
  }
  return ms;
}

/* ISO-8601 UTC string ("...Z") for a milliseconds value. */
function _isoOf(ms) {
  return new Date(ms).toISOString();
}

/* Great-circle distance in km between two WGS84 points. */
function _haversineKm(la1, lo1, la2, lo2) {
  var R = 6371.0088;
  var toRad = Math.PI / 180.0;
  var dLat = (la2 - la1) * toRad;
  var dLon = (lo2 - lo1) * toRad;
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1 * toRad) * Math.cos(la2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ------------------------------------------------------------------ buildScenario */

function buildScenario(scenarioId, windowDays, numBuses, busCapacity, meanTimeToServiceMin, replace) {
  var wDays = _posInt(windowDays, 30);
  var nBuses = _posInt(numBuses, 5);
  var cap = _posInt(busCapacity, 40);
  var mtts = _posNum(meanTimeToServiceMin, 20);
  var sid = scenarioId;
  if (!sid) {
    sid = 'sc_busplan_' + new Date().getTime();
  }

  // 1. Authoritative planner output. Same params -> same event set and estimatedDemand.
  var net = RoutePlanner.generateNetwork(wDays, nBuses, cap, mtts, null);
  var demand = net.plan.demand;
  var transitShare = demand.transitShare;
  var plannerEstimatedDemand = demand.estimatedDemand;
  var perEvent = demand.perEvent;

  // Events the planner actually used = those for which it located origin stops.
  var usedIds = [];
  var i;
  for (i = 0; i < perEvent.length; i++) {
    var pe = perEvent[i];
    if (pe.originStops && pe.originStops > 0 && pe.inboundDemand && pe.inboundDemand > 0) {
      usedIds.push(pe.eventId);
    }
  }

  // 2. Fetch those MergedEvents with coordinates (candidates + venue).
  var mergedById = {};
  if (usedIds.length > 0) {
    var parts = [];
    for (i = 0; i < usedIds.length; i++) {
      parts.push("id == '" + usedIds[i] + "'");
    }
    var res = MergedEvent.fetch({
      filter: parts.join(' || '),
      include: 'this, venue.id, venue.name, venue.latitude, venue.longitude',
      limit: -1,
    });
    var mobjs = res.objs;
    for (i = 0; i < mobjs.length; i++) {
      mergedById[mobjs[i].id] = mobjs[i];
    }
  }

  // 3. Build stop / event / travel-link records.
  var stopById = {};
  var originKeyToId = {};
  var destKeyToId = {};
  var originCounter = 0;
  var destCounter = 0;
  var originRefCount = {};

  function ensureOrigin(name, la, lo) {
    var key = _coordKey(la, lo);
    var id = originKeyToId[key];
    if (id === undefined) {
      id = 'origin_' + sid + '_' + originCounter;
      originCounter = originCounter + 1;
      originKeyToId[key] = id;
      stopById[id] = {
        id: id,
        name: name ? name : 'Pickup point',
        scenarioId: sid,
        latitude: la,
        longitude: lo,
        isCoreStop: false,
        stopCode: null,
        isSynthetic: true,
      };
      originRefCount[id] = 0;
    }
    return id;
  }

  function ensureDest(name, la, lo) {
    var key = _coordKey(la, lo);
    var id = destKeyToId[key];
    if (id === undefined) {
      id = 'dest_' + sid + '_' + destCounter;
      destCounter = destCounter + 1;
      destKeyToId[key] = id;
      stopById[id] = {
        id: id,
        name: name ? name : 'Event venue',
        scenarioId: sid,
        latitude: la,
        longitude: lo,
        isCoreStop: false,
        stopCode: null,
        isSynthetic: true,
      };
    }
    return id;
  }

  var travelByKey = {};
  var linkCounter = 0;

  function ensureLink(fromId, toId) {
    var k = fromId + '|' + toId;
    if (travelByKey[k] !== undefined) {
      return;
    }
    var a = stopById[fromId];
    var b = stopById[toId];
    var km = _haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    var mins = (km / BRIDGE_DEADHEAD_KMH) * 60.0;
    if (mins < 0.5) {
      mins = 0.5; // keep baselineTravelMinutes strictly > 0 (validation blocker otherwise)
    }
    travelByKey[k] = {
      id: 'lnk_' + sid + '_' + linkCounter,
      name: a.name + ' -> ' + b.name,
      scenarioId: sid,
      fromStopId: fromId,
      toStopId: toId,
      baselineTravelMinutes: _round2(mins),
      distanceKm: _round2(km),
      isSynthetic: true,
    };
    linkCounter = linkCounter + 1;
  }

  var simEvents = [];
  var reconPerEvent = [];
  var mappedInboundDemand = 0;
  var minStartMs = null;
  var maxEndMs = null;
  var skipped = [];

  for (i = 0; i < usedIds.length; i++) {
    var eid = usedIds[i];
    var ev = mergedById[eid];
    if (!ev) {
      skipped.push({ eventId: eid, reason: 'MergedEvent not found' });
      continue;
    }

    var att = ev.estimatedPopulation;
    if (att === null || att === undefined) {
      skipped.push({ eventId: eid, reason: 'no estimatedPopulation' });
      continue;
    }

    // Destination = venue coords, else event's own coords; never fabricated.
    var dLat = null;
    var dLng = null;
    var dName = null;
    if (ev.venue && ev.venue.latitude !== null && ev.venue.latitude !== undefined) {
      dLat = ev.venue.latitude;
      dLng = ev.venue.longitude;
      dName = ev.venue.name;
    } else if (ev.latitude !== null && ev.latitude !== undefined) {
      dLat = ev.latitude;
      dLng = ev.longitude;
      dName = ev.locationName ? ev.locationName : ev.name;
    }
    if (dLat === null || dLat === undefined || dLng === null || dLng === undefined) {
      skipped.push({ eventId: eid, reason: 'no destination coordinates' });
      continue;
    }
    var destId = ensureDest(dName, dLat, dLng);

    // Origins = scored startStopCandidates with coordinates.
    var cands = ev.startStopCandidates;
    var originDist = [];
    var jj;
    if (cands) {
      for (jj = 0; jj < cands.length; jj++) {
        var c = cands[jj];
        if (c.latitude === null || c.latitude === undefined || c.longitude === null || c.longitude === undefined) {
          continue;
        }
        var oId = ensureOrigin(c.name, c.latitude, c.longitude);
        if (oId === destId) {
          continue; // separate namespaces make this unreachable, but guard the drop-case anyway
        }
        var sc = c.score;
        if (sc === null || sc === undefined || !(sc > 0)) {
          sc = 0.01;
        }
        originDist.push({ stopId: oId, share: sc });
        var prev = originRefCount[oId];
        originRefCount[oId] = prev + sc;
        ensureLink(oId, destId);
        ensureLink(destId, oId);
      }
    }
    if (originDist.length === 0) {
      skipped.push({ eventId: eid, reason: 'no origin candidates with coordinates' });
      continue;
    }

    var startMs = _msOf(ev.startTime);
    if (startMs === null) {
      skipped.push({ eventId: eid, reason: 'unparseable startTime' });
      continue;
    }
    var endMs = _msOf(ev.endTime);
    if (endMs === null || endMs <= startMs) {
      endMs = startMs + 60 * 60000;
    }
    if (minStartMs === null || startMs < minStartMs) {
      minStartMs = startMs;
    }
    if (maxEndMs === null || endMs > maxEndMs) {
      maxEndMs = endMs;
    }

    // Mapped inbound riders == round(attendance * busUseShare), matching the generator (weight 1.0
    // because eventSource='Scheduled') and the planner's per-event inboundDemand.
    var inbound = Math.round(att * transitShare);
    mappedInboundDemand = mappedInboundDemand + inbound;

    var eventType = 'ClassOrGathering';
    if (att >= 1000) {
      eventType = 'LargeEvent';
    }

    var demandEffect = {
      cohortId: 'cohort_' + eid,
      attendance: att,
      busUseShare: transitShare,
      originDistribution: originDist,
      destinationDistribution: [{ stopId: destId, share: 1.0 }],
      generatesInbound: true,
      generatesOutbound: false,
      inboundWindowStartOffsetMin: -60,
      inboundWindowEndOffsetMin: -5,
      outboundWindowStartOffsetMin: 5,
      outboundWindowEndOffsetMin: 60,
      classDeadlineOffsetMin: 0,
    };

    var basis = ev.populationBasis ? ev.populationBasis : 'planner estimate';
    simEvents.push({
      id: 'ev_' + sid + '_' + eid,
      scenarioId: sid,
      name: ev.name,
      eventType: eventType,
      startTime: _isoOf(startMs),
      endTime: _isoOf(endMs),
      knownAt: _isoOf(startMs), // placeholder; fixed to planningCutoff after horizon is known
      affectedStopIds: [destId],
      eventSource: 'Scheduled',
      confidence: 1.0,
      demandEffect: demandEffect,
      isSynthetic: true,
      notes:
        'Demand derived from MergedEvent ' +
        eid +
        '. attendance=' +
        att +
        ' (basis: ' +
        basis +
        '); busUseShare=' +
        transitShare +
        ' (PlannerConfig.transitShare); inbound only; mapped inbound riders=' +
        inbound +
        '.',
    });

    reconPerEvent.push({
      eventId: eid,
      name: ev.name,
      attendance: att,
      transitShare: transitShare,
      plannerInboundDemand: pe_inbound_(perEvent, eid),
      mappedInboundDemand: inbound,
      originStops: originDist.length,
      destinationStopId: destId,
    });
  }

  // 4. Horizon + planning cutoff. Fall back to a sane window if no events mapped.
  var nowMs = new Date().getTime();
  if (minStartMs === null) {
    minStartMs = nowMs;
    maxEndMs = nowMs + wDays * 24 * 60 * 60000;
  }
  var horizonStartMs = minStartMs - 120 * 60000;
  var horizonEndMs = maxEndMs + 120 * 60000;
  var planningCutoffMs = horizonStartMs; // all demand events visible to the planner

  // Fix knownAt so every demand event is visible to the sim planner (knownAt <= planningCutoff).
  var cutoffIso = _isoOf(planningCutoffMs);
  for (i = 0; i < simEvents.length; i++) {
    simEvents[i].knownAt = cutoffIso;
  }

  // 5. Extra-bus pool = the proposed supplemental fleet. Hub = most-referenced origin stop.
  var hubId = null;
  var hubBest = -1;
  var okeys = Object.keys(originRefCount);
  for (i = 0; i < okeys.length; i++) {
    var ok = okeys[i];
    if (originRefCount[ok] > hubBest) {
      hubBest = originRefCount[ok];
      hubId = ok;
    }
  }
  if (hubId === null) {
    // No origins (no events mapped) -> author one placeholder hub so extra buses have a start stop.
    hubId = ensureOrigin('Transit hub (placeholder)', 40.1101, -88.2305);
  }

  var extraBuses = [];
  var availFromIso = _isoOf(horizonStartMs);
  var availToIso = _isoOf(horizonEndMs);
  for (i = 0; i < nBuses; i++) {
    extraBuses.push({
      id: 'xbus_' + sid + '_' + i,
      name: 'Supplemental bus ' + (i + 1),
      scenarioId: sid,
      capacity: cap,
      availableFrom: availFromIso,
      availableTo: availToIso,
      startStopId: hubId,
      fixedCostPerDay: 180,
      costPerOperatingMinute: 2.4,
      costPerDeadheadMinute: 2.4,
      costPerDwellMinute: 1.2,
      currency: 'USD',
      isSynthetic: true,
    });
  }

  // 6. Collect record arrays.
  var stopArr = [];
  var skeys = Object.keys(stopById);
  for (i = 0; i < skeys.length; i++) {
    stopArr.push(stopById[skeys[i]]);
  }
  var linkArr = [];
  var lkeys = Object.keys(travelByKey);
  for (i = 0; i < lkeys.length; i++) {
    linkArr.push(travelByKey[lkeys[i]]);
  }

  // 7. Scenario record.
  var scenario = {
    id: sid,
    name: 'Bus-plan integration ' + sid,
    description:
      'Auto-authored from the campus bus-route planner (' +
      wDays +
      '-day window, ' +
      nBuses +
      ' proposed buses x ' +
      cap +
      ' seats). Demand from ' +
      simEvents.length +
      ' campus events; existing MTD core service omitted (no coordinates available).',
    serviceDate: _isoOf(minStartMs).substring(0, 10),
    serviceTimezone: 'America/Chicago',
    horizonStart: _isoOf(horizonStartMs),
    horizonEnd: _isoOf(horizonEndMs),
    planningCutoff: cutoffIso,
    randomSeed: BRIDGE_RANDOM_SEED,
    maxExtraBuses: nBuses,
    costConfig: {
      currency: 'USD',
      includeIdleAllocatedBuses: true,
      fixedCostPerAllocatedBus: 180,
      costPerOperatingMinute: 2.4,
      costPerDeadheadMinute: 2.4,
      costPerDwellMinute: 1.2,
    },
    assumptions: {
      defaultDwellMinutes: 0.5,
      boardingSecondsPerPassenger: 3,
      alightingSecondsPerPassenger: 2,
      reliabilityPolicy: 'ConfidenceTimesReputation',
      defaultConfidence: 0.7,
      defaultReputation: 0.5,
      maxTravelTimeMultiplier: 3,
      overlappingMultiplierRule: 'Multiply',
      cohortOverlapPolicy: 'PreferEvent',
      reportMatchWindowMinutes: 45,
      allowTransfers: false,
      queueDiscipline: 'FifoByRequestTime',
      arrivalWindowDistribution: 'UniformDeterministic',
      stopDelayWindowMinutes: 15,
      deadheadSpeedKmPerHour: BRIDGE_DEADHEAD_KMH,
      minTurnaroundMinutes: 5,
    },
    contractVersion: BRIDGE_CONTRACT_VERSION,
    syntheticDataLabel: BRIDGE_SYNTH_LABEL,
    scenarioTags: ['busplan', 'generated', 'surge'],
    isSynthetic: true,
  };

  // 8. Persist (optionally replacing prior scenario-scoped records).
  if (replace) {
    var scopeFilter = "scenarioId == '" + sid + "'";
    SimStop.removeAll({ filter: scopeFilter }, true);
    SimEvent.removeAll({ filter: scopeFilter }, true);
    SimExtraBus.removeAll({ filter: scopeFilter }, true);
    SimTravelLink.removeAll({ filter: scopeFilter }, true);
    SimRouteDef.removeAll({ filter: scopeFilter }, true);
    SimCoreTrip.removeAll({ filter: scopeFilter }, true);
    SimScenario.removeAll({ filter: "id == '" + sid + "'" }, true);
  }
  if (stopArr.length > 0) {
    SimStop.mergeBatch(stopArr);
  }
  if (simEvents.length > 0) {
    SimEvent.mergeBatch(simEvents);
  }
  if (extraBuses.length > 0) {
    SimExtraBus.mergeBatch(extraBuses);
  }
  if (linkArr.length > 0) {
    SimTravelLink.mergeBatch(linkArr);
  }
  SimScenario.mergeBatch([scenario]);

  // 9. Validate the assembled input.
  var input = SimInputAssembler.assemble(sid);
  var report = SimInputAssembler.validate(input);
  var errorList = [];
  var issues = report.issues;
  if (issues) {
    for (i = 0; i < issues.length; i++) {
      var iss = issues[i];
      if (iss.severity === 'Error') {
        errorList.push({ code: iss.code, message: iss.message, refKind: iss.refKind, refId: iss.refId });
      }
    }
  }

  var match = mappedInboundDemand === plannerEstimatedDemand;

  return {
    scenarioId: sid,
    maxExtraBuses: nBuses,
    created: {
      stops: stopArr.length,
      events: simEvents.length,
      extraBuses: extraBuses.length,
      travelLinks: linkArr.length,
    },
    horizon: {
      horizonStart: scenario.horizonStart,
      horizonEnd: scenario.horizonEnd,
      planningCutoff: scenario.planningCutoff,
      serviceDate: scenario.serviceDate,
      serviceTimezone: scenario.serviceTimezone,
    },
    reconciliation: {
      plannerEstimatedDemand: plannerEstimatedDemand,
      mappedInboundDemand: mappedInboundDemand,
      match: match,
      note:
        'Inbound-only. mappedInboundDemand = sum of round(attendance * transitShare) over mapped ' +
        'events; equals the planner estimatedDemand and the demand the generator will emit ' +
        '(eventSource=Scheduled -> reliability weight 1.0).',
      perEvent: reconPerEvent,
      skipped: skipped,
    },
    distinction: {
      existingMtd:
        'Existing MTD service maps to simulator CORE service (SimRouteDef.isCore + SimCoreTrip). ' +
        'OMITTED here: core stops require latitude/longitude, which the CUMTD pipeline does not ' +
        'expose (stop_id/stop_name only). The baseline therefore runs with zero core capacity.',
      proposedSupplemental:
        'Proposed supplemental routes map to the SimExtraBus pool (' +
        nBuses +
        ' buses x ' +
        cap +
        ' seats), the only decision variable; the sim planner allocates 0..' +
        nBuses +
        ' and synthesizes their trips from demand.',
    },
    validation: {
      isValid: report.isValid,
      errorCount: report.errorCount,
      warningCount: report.warningCount,
      errors: errorList,
    },
    simplifications: [
      'Existing MTD core service omitted (no stop coordinates in the CUMTD feed); baseline = no core capacity.',
      'Demand is inbound-only (travel to events); outbound dispersal not modelled in this pass.',
      'Travel links estimated by haversine at the scenario deadhead speed (' +
        BRIDGE_DEADHEAD_KMH +
        ' km/h), labelled synthetic.',
      'Origin stops consolidated by rounded coordinate; a single hub origin is the extra-bus start stop.',
    ],
    missing: [
      {
        item: 'Existing MTD route geometry with stop coordinates',
        whyItMatters:
          'Needed to populate SimStop (lat/lng required) and SimCoreTrip so the comparison is ' +
          '"proposed supplemental vs real existing service" rather than vs no service.',
        needed:
          'CUMTD GTFS stops.txt (stop_lat/stop_lon) or a geocoded stop list; then map baseline ' +
          'routes to SimRouteDef(isCore=true)+SimCoreTrip with timed stopTimes.',
      },
    ],
    provenance: {
      plannerParams: { windowDays: wDays, numBuses: nBuses, busCapacity: cap, meanTimeToServiceMin: mtts },
      transitShare: transitShare,
      contractVersion: BRIDGE_CONTRACT_VERSION,
      syntheticDataLabel: BRIDGE_SYNTH_LABEL,
    },
  };
}

/* Look up a planner per-event inboundDemand by MergedEvent id (for the reconciliation table). */
function pe_inbound_(perEvent, eid) {
  var i;
  for (i = 0; i < perEvent.length; i++) {
    if (perEvent[i].eventId === eid) {
      return perEvent[i].inboundDemand;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ buildAndCompare */

function buildAndCompare(scenarioId, windowDays, numBuses, busCapacity, meanTimeToServiceMin, replace) {
  var report = buildScenario(scenarioId, windowDays, numBuses, busCapacity, meanTimeToServiceMin, replace);

  if (!report.validation.isValid) {
    report.comparison = null;
    report.comparisonSkipped =
      'Validation failed with ' + report.validation.errorCount + ' error(s); comparison not run.';
    return report;
  }

  var cmp = SimRunner.runComparison(report.scenarioId, report.maxExtraBuses);

  var curve = cmp.costCurve;
  var points = [];
  var baselineWait = null;
  var best = null;
  var i;
  if (curve) {
    for (i = 0; i < curve.length; i++) {
      var p = curve[i];
      if (p.allocation === 0) {
        baselineWait = p.horizonTotalWaitingMinutes;
      }
      var point = {
        allocation: p.allocation,
        busesUsed: p.busesUsed,
        busesIdle: p.busesIdle,
        operatingCost: p.operatingCost,
        currency: p.currency,
        horizonTotalWaitingMinutes: p.horizonTotalWaitingMinutes,
        horizonWaitingMinutesSaved: p.horizonWaitingMinutesSaved,
        avgWaitMinutesCompleted: p.avgWaitMinutesCompleted,
        p95WaitMinutesCompleted: p.p95WaitMinutesCompleted,
        unservedPassengers: p.unservedPassengers,
        lateCompletedPassengers: p.lateCompletedPassengers,
        costPerWaitingMinuteSaved: p.costPerWaitingMinuteSaved,
        costPerMinuteSavedUnavailableReason: p.costPerMinuteSavedUnavailableReason,
      };
      points.push(point);
      if (p.allocation > 0 && (best === null || p.horizonWaitingMinutesSaved > best.horizonWaitingMinutesSaved)) {
        best = point;
      }
    }
  }

  var assertions = [];
  var ca = cmp.comparabilityAssertions;
  if (ca) {
    for (i = 0; i < ca.length; i++) {
      assertions.push(ca[i]);
    }
  }

  report.comparison = {
    scenarioName: cmp.scenarioName,
    baselineHorizonWaitingMinutes: baselineWait,
    recommendedByWaitSaved: best,
    costCurve: points,
    comparabilityAssertions: assertions,
    syntheticDataLabel: cmp.syntheticDataLabel,
  };
  return report;
}
