function run(input, snapshot, plan, realizedEffects) {
  var a = input.assumptions;
  var horizonEndMs = msOf(input.horizonEnd);
  var net = buildNetwork(input);
  var effIdx = indexEffects(realizedEffects);
  var infeasibilities = [];

  var vehicles = buildVehicles(input, plan, effIdx, infeasibilities);
  var queues = buildQueues(snapshot);

  var frames = [];
  var completed = [];          // {count, waitMin, inVehicleMin, late, hasDeadline}
  var waitObservations = [];   // {stopId, requestMs, waitMinutes, count, censored}
  var totalBoardings = 0;
  var totalAlightings = 0;
  var peakOnboard = 0;

  // ---- discrete-event loop ----
  var pending = [];
  var v;
  for (v = 0; v < vehicles.length; v++) {
    pending.push(vehicles[v].skipped ? null : { stopIdx: 0, timeMs: vehicles[v].stops[0].schedArrMs });
  }

  var guard = 0;
  while (true) {
    guard++;
    if (guard > 200000) {
      infeasibilities.push(issue('Error', 'SimulationGuardTripped',
        'The event loop exceeded its step guard; results for this run are incomplete.', 'Plan', plan.planId));
      break;
    }

    // Earliest pending arrival, tie-broken by vehicle index so the order is fully determined.
    var bestV = -1;
    var bestT = null;
    for (v = 0; v < pending.length; v++) {
      if (pending[v] === null) { continue; }
      if (bestT === null || pending[v].timeMs < bestT) { bestT = pending[v].timeMs; bestV = v; }
    }
    if (bestV < 0) { break; }

    var veh = vehicles[bestV];
    var cur = pending[bestV];
    var si = cur.stopIdx;
    var arrival = cur.timeMs;
    var visit = veh.stops[si];

    if (arrival > horizonEndMs) {
      // Beyond the horizon. Whoever is aboard is reported as onboard at the horizon rather than
      // being quietly completed.
      pending[bestV] = null;
      continue;
    }

    var boarded = 0;
    var alighted = 0;
    var leftBehind = 0;
    var stopClosed = isUnavailable(effIdx.stop, visit.stopId, arrival);

    if (!stopClosed) {
      // 1. Alight anyone whose destination is this stop.
      var keep = [];
      for (var p = 0; p < veh.onboard.length; p++) {
        var pax = veh.onboard[p];
        if (pax.dest === visit.stopId) {
          var inVehicleMin = (arrival - pax.boardMs) / 60000;
          completed.push({
            count: pax.count,
            waitMin: pax.waitMin,
            inVehicleMin: inVehicleMin,
            hasDeadline: pax.hasDeadline,
            late: pax.hasDeadline === true && arrival > pax.deadlineMs
          });
          alighted += pax.count;
          veh.load -= pax.count;
        } else {
          keep.push(pax);
        }
      }
      veh.onboard = keep;
      totalAlightings += alighted;

      // 2. Board, FIFO by request time, filtered by destination eligibility. A passenger is never
      // boarded onto a trip that cannot reach their destination.
      if (!visit.isDeadhead && si < veh.stops.length - 1) {
        var q = queues[visit.stopId];
        if (q) {
          var served = veh.servedAfter[si];
          for (var qi = 0; qi < q.length; qi++) {
            var item = q[qi];
            if (item.remaining <= 0) { continue; }
            if (item.requestMs > arrival) { break; }
            if (!served[item.dest]) { continue; }
            var room = veh.capacity - veh.load;
            if (room <= 0) { break; }
            var take = item.remaining < room ? item.remaining : room;
            var waitMin = (arrival - item.requestMs) / 60000;
            veh.onboard.push({
              count: take, dest: item.dest, boardMs: arrival, waitMin: waitMin,
              hasDeadline: item.hasDeadline, deadlineMs: item.deadlineMs
            });
            veh.load += take;
            item.remaining -= take;
            boarded += take;
            waitObservations.push({
              stopId: visit.stopId, requestMs: item.requestMs, waitMinutes: waitMin,
              count: take, censored: false
            });
          }
          // Anyone this vehicle could have carried but left behind.
          for (var qj = 0; qj < q.length; qj++) {
            var it2 = q[qj];
            if (it2.remaining > 0 && it2.requestMs <= arrival && veh.servedAfter[si][it2.dest]) {
              leftBehind += it2.remaining;
            }
          }
        }
      }
      totalBoardings += boarded;
    }

    if (veh.load > veh.capacity) {
      infeasibilities.push(issue('Error', 'CapacityExceeded',
        'Vehicle ' + veh.vid + ' carried ' + veh.load + ' passengers against a capacity of ' + veh.capacity + '.',
        'Vehicle', veh.vid));
    }
    if (veh.load > peakOnboard) { peakOnboard = veh.load; }

    // 3. Dwell, then departure. A bus never departs before its timetabled departure.
    var dwellMin = stopClosed ? 0 : effectiveDwell(a, boarded, alighted);
    var departure = arrival + Math.round(dwellMin * 60000);
    if (visit.schedDepMs !== null && visit.schedDepMs > departure) { departure = visit.schedDepMs; }
    veh.dwellMinutes += dwellMin;

    frames.push({
      timeMs: arrival,
      iso: DateTime.fromMillis(arrival).toString(),
      vehicleId: veh.vid,
      vehicleKind: veh.kind,
      stopId: visit.stopId,
      stopClosed: stopClosed,
      isDeadhead: visit.isDeadhead === true,
      boarded: boarded,
      alighted: alighted,
      leftBehind: leftBehind,
      onboard: veh.load,
      capacity: veh.capacity,
      departureMs: departure
    });

    if (stopClosed) {
      infeasibilities.push(issue('Warning', 'StopClosedUnderPlan',
        'Vehicle ' + veh.vid + ' was scheduled to serve stop ' + visit.stopId + ' at '
        + DateTime.fromMillis(arrival).toString() + ' but the stop was unavailable. The visit was skipped; no passenger was relocated and no alternate route was invented.',
        'Stop', visit.stopId));
    }

    // 4. Advance to the next stop, applying the travel-time multiplier in force at departure.
    if (si + 1 >= veh.stops.length) {
      pending[bestV] = null;
      if (veh.load > 0) {
        // Still carrying passengers when the itinerary ends: they are onboard at the horizon.
        veh.endedLoaded = true;
      }
      continue;
    }
    var nextVisit = veh.stops[si + 1];
    var travel = travelMinutes(net, visit.stopId, nextVisit.stopId, visit, nextVisit);
    var link = net.linkByPair[visit.stopId + '|' + nextVisit.stopId];
    var mult = link ? multiplierAt(effIdx.link, link.id, departure) : 1.0;
    var realizedTravel = travel * mult;
    if (realizedTravel <= 0) { realizedTravel = 0.5; }
    veh.operatingMinutes += realizedTravel;
    if (nextVisit.isDeadhead === true || visit.isDeadhead === true) { veh.deadheadMinutes += realizedTravel; }
    pending[bestV] = { stopIdx: si + 1, timeMs: departure + Math.round(realizedTravel * 60000) };
  }

  // ---- horizon censoring ----
  var waitingAtHorizon = 0;
  var deniedByClosure = 0;
  var accruedWaitingMinutes = 0;
  var deadlineBearingUnserved = 0;
  var stopKeys = [];
  var sk;
  for (sk in queues) { stopKeys.push(sk); }
  stopKeys.sort();
  for (var s = 0; s < stopKeys.length; s++) {
    var items = queues[stopKeys[s]];
    for (var ii = 0; ii < items.length; ii++) {
      var left = items[ii];
      if (left.remaining <= 0) { continue; }
      var accrued = (horizonEndMs - left.requestMs) / 60000;
      if (accrued < 0) { accrued = 0; }
      accruedWaitingMinutes += accrued * left.remaining;
      waitObservations.push({
        stopId: stopKeys[s], requestMs: left.requestMs, waitMinutes: accrued,
        count: left.remaining, censored: true
      });
      if (left.hasDeadline === true) { deadlineBearingUnserved += left.remaining; }
      if (closureOverlaps(effIdx.stop, stopKeys[s], left.requestMs, horizonEndMs)) {
        deniedByClosure += left.remaining;
      } else {
        waitingAtHorizon += left.remaining;
      }
    }
  }

  var onboardAtHorizon = 0;
  for (v = 0; v < vehicles.length; v++) {
    var vv = vehicles[v];
    for (var oi = 0; oi < vv.onboard.length; oi++) { onboardAtHorizon += vv.onboard[oi].count; }
  }

  // ---- accounting ----
  var generated = snapshot.totalPassengers;
  var completedPassengers = 0;
  for (var ci = 0; ci < completed.length; ci++) { completedPassengers += completed[ci].count; }
  var balanced = generated === (completedPassengers + waitingAtHorizon + onboardAtHorizon + deniedByClosure);
  if (!balanced) {
    infeasibilities.push(issue('Error', 'AccountingImbalance',
      'Generated ' + generated + ' passengers but accounted for '
      + (completedPassengers + waitingAtHorizon + onboardAtHorizon + deniedByClosure)
      + ' (completed ' + completedPassengers + ', waiting ' + waitingAtHorizon
      + ', onboard ' + onboardAtHorizon + ', denied ' + deniedByClosure + ').', 'Plan', plan.planId));
  }

  var accounting = SimAccounting.make({
    generatedPassengers: generated,
    completedPassengers: completedPassengers,
    waitingAtHorizon: waitingAtHorizon,
    onboardAtHorizon: onboardAtHorizon,
    deniedByClosure: deniedByClosure,
    isBalanced: balanced,
    peakOnboard: peakOnboard,
    totalBoardings: totalBoardings,
    totalAlightings: totalAlightings
  });

  var metrics = computeMetrics(input, snapshot, plan, completed, completedPassengers,
    accruedWaitingMinutes, waitingAtHorizon + onboardAtHorizon + deniedByClosure, deadlineBearingUnserved);

  var replay = {
    frames: frames,
    bottlenecks: computeBottlenecks(input, queues, waitObservations, a),
    waitObservations: waitObservations,
    notes: [
      'Frames are the realized vehicle visits in chronological order. They are a replay aid, not a dispatch instruction.',
      'leftBehind counts passengers present and destination-eligible whom the vehicle could not take.',
      'All times are absolute UTC instants; the service timezone is ' + input.serviceTimezone + '.'
    ]
  };

  var results = SimResults.make({
    resultsId: 'res_' + plan.planId,
    scenarioId: input.scenarioId,
    contractVersion: input.contractVersion,
    snapshotId: snapshot.snapshotId,
    seed: snapshot.seed,
    planId: plan.planId,
    planKind: plan.planKind,
    allocation: plan.allocation,
    metrics: metrics,
    accounting: accounting,
    eventActivations: buildActivations(input, snapshot),
    infeasibilities: infeasibilities,
    replayFrames: replay,
    unitsNote: 'All durations are MINUTES. All timestamps are absolute instants. Costs are in '
      + (input.costConfig ? input.costConfig.currency : 'unspecified currency')
      + ' and cover supplemental buses only; core service cost is out of scope.',
    syntheticDataLabel: input.syntheticDataLabel
  });

  return results.withStopWindowDelays(buildStopWindowDelays(input, net, effIdx, waitObservations));
}

function stopWindowDelays(input, results) {
  var net = buildNetwork(input);
  var replay = results.replayFrames || {};
  var obs = replay.waitObservations || [];
  // Re-resolving effects is not possible from results alone, so unavailability is read back from
  // the frames the run recorded.
  var closed = {};
  var frames = replay.frames || [];
  for (var i = 0; i < frames.length; i++) {
    if (frames[i].stopClosed === true) { closed[frames[i].stopId + '|' + frames[i].timeMs] = true; }
  }
  return aggregateWindows(input, net, obs, function (stopId, startMs, endMs) {
    for (var k = 0; k < frames.length; k++) {
      if (frames[k].stopId === stopId && frames[k].stopClosed === true
        && frames[k].timeMs >= startMs && frames[k].timeMs < endMs) { return true; }
    }
    return false;
  });
}

// ---- local helpers ----

function buildStopWindowDelays(input, net, effIdx, observations) {
  return aggregateWindows(input, net, observations, function (stopId, startMs, endMs) {
    return closureOverlaps(effIdx.stop, stopId, startMs, endMs);
  });
}

/**
 * Buckets wait observations into fixed windows per stop.
 *
 * A window with no observations reports hasObservations false and a NULL estimatedWaitMinutes.
 * Absence of data is never encoded as zero wait, because zero reads to a student as "no delay".
 */
function aggregateWindows(input, net, observations, closedFn) {
  var a = input.assumptions;
  var windowMin = (a && a.stopDelayWindowMinutes) ? a.stopDelayWindowMinutes : 15;
  var windowMs = windowMin * 60000;
  var startMs = msOf(input.horizonStart);
  var endMs = msOf(input.horizonEnd);

  var byKey = {};
  for (var i = 0; i < observations.length; i++) {
    var o = observations[i];
    var w = Math.floor((o.requestMs - startMs) / windowMs);
    if (w < 0) { w = 0; }
    var key = o.stopId + '|' + w;
    if (!byKey[key]) {
      byKey[key] = { stopId: o.stopId, w: w, sum: 0, count: 0, censored: 0, max: 0 };
    }
    var bucket = byKey[key];
    bucket.sum += o.waitMinutes * o.count;
    bucket.count += o.count;
    if (o.censored === true) { bucket.censored += o.count; }
    if (o.waitMinutes > bucket.max) { bucket.max = o.waitMinutes; }
  }

  var out = [];
  var stops = net.stops;
  var windows = Math.ceil((endMs - startMs) / windowMs);
  for (var si = 0; si < stops.length; si++) {
    var stop = stops[si];
    for (var wi = 0; wi < windows; wi++) {
      var ws = startMs + wi * windowMs;
      var we = Math.min(ws + windowMs, endMs);
      var b = byKey[stop.id + '|' + wi];
      out.push(SimStopWindowDelay.make({
        stopId: stop.id,
        stopName: stop.name,
        windowStart: DateTime.fromMillis(ws),
        windowEnd: DateTime.fromMillis(we),
        estimatedWaitMinutes: b ? round2(b.sum / b.count) : null,
        supportingPassengerCount: b ? b.count : 0,
        hasObservations: b ? true : false,
        censoredPassengerCount: b ? b.censored : 0,
        maxWaitMinutes: b ? round2(b.max) : null,
        stopUnavailableInWindow: closedFn(stop.id, ws, we)
      }));
    }
  }
  return out;
}

function computeMetrics(input, snapshot, plan, completed, completedPassengers,
  accruedWaitingMinutes, unservedAtHorizon, deadlineBearingUnserved) {
  var cfg = input.costConfig;
  var waits = [];
  var totalWaitCompleted = 0;
  var totalTripCompleted = 0;
  var totalInVehicle = 0;
  var lateCompleted = 0;
  var i;

  for (i = 0; i < completed.length; i++) {
    var c = completed[i];
    totalWaitCompleted += c.waitMin * c.count;
    totalInVehicle += c.inVehicleMin * c.count;
    totalTripCompleted += (c.waitMin + c.inVehicleMin) * c.count;
    if (c.late === true) { lateCompleted += c.count; }
    for (var k = 0; k < c.count; k++) { waits.push(c.waitMin); }
  }
  waits.sort(function (x, y) { return x - y; });

  var deadlineBearing = snapshot.deadlineBearingPassengers || 0;

  return SimMetrics.make({
    avgWaitMinutesCompleted: completedPassengers > 0 ? round2(totalWaitCompleted / completedPassengers) : null,
    p95WaitMinutesCompleted: waits.length > 0 ? round2(percentile(waits, 0.95)) : null,
    totalWaitingMinutesCompleted: round2(totalWaitCompleted),
    horizonTotalWaitingMinutes: round2(totalWaitCompleted + accruedWaitingMinutes),
    accruedWaitingMinutesUnserved: round2(accruedWaitingMinutes),
    completedPassengers: completedPassengers,
    avgTripTimeMinutesCompleted: completedPassengers > 0 ? round2(totalTripCompleted / completedPassengers) : null,
    avgInVehicleMinutesCompleted: completedPassengers > 0 ? round2(totalInVehicle / completedPassengers) : null,
    lateCompletedPassengers: lateCompleted,
    deadlineBearingPassengers: deadlineBearing,
    lateCompletedPct: deadlineBearing > 0 ? round2(100.0 * lateCompleted / deadlineBearing) : null,
    deadlineBearingUnserved: deadlineBearingUnserved,
    unservedAtHorizon: unservedAtHorizon,
    extraBusOperatingCost: plan.totalOperatingCost === null || plan.totalOperatingCost === undefined
      ? 0 : plan.totalOperatingCost,
    currency: cfg ? cfg.currency : null,
    costPerWaitingMinuteSaved: null,
    costPerMinuteSavedUnavailableReason: plan.planKind === 'MockOldModelBaseline' ? 'BaselineRun' : null,
    costBasisNote: 'Operating cost covers SUPPLEMENTAL buses only: a per-bus fixed allocation charge plus '
      + 'per-minute charges for in-service running, deadheading and dwelling. '
      + (cfg && cfg.includeIdleAllocatedBuses === true
        ? 'Allocated buses the plan leaves idle are still charged their fixed cost, because allocating a bus commits it.'
        : 'Allocated buses the plan leaves idle are not charged.')
      + ' Core MTD service cost is excluded entirely; it is identical in every run.',
    denominatorNote: 'Wait and trip-time averages are over COMPLETED passengers only and are therefore '
      + 'subject to survivor bias: the passengers who never got a bus are not in them. Read them next to '
      + 'unservedAtHorizon and accruedWaitingMinutesUnserved. horizonTotalWaitingMinutes is the '
      + 'horizon-based total that includes wait accrued by passengers still waiting at the horizon; that '
      + 'accrued wait is censored, not final. Lateness percentages are over deadline-bearing passengers '
      + 'only; an unserved deadline-bearing passenger is reported in deadlineBearingUnserved and is NEVER '
      + 'counted as on time.'
  });
}

/**
 * Summarises where and when waiting actually piled up, keyed by origin stop and request-time
 * window.
 *
 * Ranked by total waiting minutes rather than by headcount, because waiting minutes are what the
 * planner is trying to buy down and what the cost curve is denominated in. Destination mixes come
 * from the demand itself, so a recommended trip can be aimed at a destination passengers are
 * actually trying to reach rather than at an arbitrary downstream stop.
 */
function computeBottlenecks(input, queues, waitObservations, a) {
  var windowMin = (a && a.stopDelayWindowMinutes) ? a.stopDelayWindowMinutes : 15;
  var windowMs = windowMin * 60000;
  var startMs = msOf(input.horizonStart);
  var byKey = {};
  var i;

  var bucketFor = function (stopId, requestMs) {
    var w = Math.floor((requestMs - startMs) / windowMs);
    if (w < 0) { w = 0; }
    var key = stopId + '|' + w;
    if (!byKey[key]) {
      byKey[key] = {
        stopId: stopId, windowStartMs: startMs + w * windowMs, windowEndMs: startMs + (w + 1) * windowMs,
        demandPax: 0, unservedPax: 0, deadlineAtRisk: 0, waitMinutes: 0, observedPax: 0,
        censoredPax: 0, destCounts: {}
      };
    }
    return byKey[key];
  };

  var stopIds = [];
  for (var sid in queues) { stopIds.push(sid); }
  stopIds.sort();
  for (var s = 0; s < stopIds.length; s++) {
    var items = queues[stopIds[s]];
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var b = bucketFor(stopIds[s], it.requestMs);
      b.demandPax += it.originalCount;
      b.unservedPax += it.remaining;
      b.destCounts[it.dest] = (b.destCounts[it.dest] || 0) + it.originalCount;
      if (it.hasDeadline === true) { b.deadlineAtRisk += it.remaining; }
    }
  }

  for (i = 0; i < waitObservations.length; i++) {
    var o = waitObservations[i];
    var ob = bucketFor(o.stopId, o.requestMs);
    ob.waitMinutes += o.waitMinutes * o.count;
    ob.observedPax += o.count;
    if (o.censored === true) { ob.censoredPax += o.count; }
  }

  var out = [];
  var keys = [];
  for (var k in byKey) { keys.push(k); }
  keys.sort();
  for (var ki = 0; ki < keys.length; ki++) {
    var bk = byKey[keys[ki]];
    bk.avgWaitMinutes = bk.observedPax > 0 ? round2(bk.waitMinutes / bk.observedPax) : 0;
    bk.waitMinutes = round2(bk.waitMinutes);
    out.push(bk);
  }

  out.sort(function (x, y) {
    var sx = x.waitMinutes + 5 * x.deadlineAtRisk;
    var sy = y.waitMinutes + 5 * y.deadlineAtRisk;
    if (sy !== sx) { return sy - sx; }
    if (x.windowStartMs !== y.windowStartMs) { return x.windowStartMs - y.windowStartMs; }
    return x.stopId < y.stopId ? -1 : 1;
  });
  return out;
}

function buildActivations(input, snapshot) {
  var cutoffMs = msOf(input.planningCutoff);
  var paxByEvent = {};
  var trace = snapshot.trace || [];
  var i;
  for (i = 0; i < trace.length; i++) {
    if (trace[i].sourceEventId) {
      paxByEvent[trace[i].sourceEventId] = (paxByEvent[trace[i].sourceEventId] || 0) + trace[i].generatedPassengers;
    }
  }
  var weightByEvent = {};
  var entries = (input.reconciliation && input.reconciliation.entries) ? input.reconciliation.entries : [];
  for (i = 0; i < entries.length; i++) {
    if (entries[i].entryKind === 'ReliabilityWeightApplied' && entries[i].targetEventId) {
      weightByEvent[entries[i].targetEventId] = entries[i].appliedWeight;
    }
  }

  var out = [];
  var events = input.events || [];
  for (i = 0; i < events.length; i++) {
    var ev = events[i];
    var suppressed = ev.canonicalEventId || ev.supersededByEventId;
    var kinds = [];
    var affected = [];
    var effects = ev.operationalEffects || [];
    for (var j = 0; j < effects.length; j++) {
      kinds.push(effects[j].effectKind);
      var tgt = effects[j].effectKind === 'TravelTimeMultiplier' ? effects[j].linkIds
        : (effects[j].effectKind === 'StopUnavailable' ? effects[j].stopIds : effects[j].busIds);
      for (var t = 0; t < (tgt || []).length; t++) { affected.push(tgt[t]); }
    }
    var summaryParts = [];
    if (suppressed) {
      summaryParts.push('Suppressed by reconciliation; contributes no demand and no operational effect.');
    } else {
      if (ev.demandEffect) {
        summaryParts.push('Generated ' + (paxByEvent[ev.id] || 0) + ' synthetic passengers.');
      }
      if (kinds.length > 0) { summaryParts.push('Operational effects: ' + kinds.join(', ') + '.'); }
      if (summaryParts.length === 0) { summaryParts.push('No modelled effect.'); }
    }

    out.push(SimEventActivation.make({
      eventId: ev.id,
      eventName: ev.name,
      eventType: ev.eventType,
      activationTime: ev.startTime,
      deactivationTime: ev.endTime,
      visibleToPlanner: !suppressed && msOf(ev.knownAt) <= cutoffMs,
      effectSummary: summaryParts.join(' '),
      affectedIds: affected,
      generatedPassengers: suppressed ? 0 : (paxByEvent[ev.id] || 0),
      operationalEffectKinds: kinds,
      appliedWeight: suppressed ? 0 : weightByEvent[ev.id]
    }));
  }
  return out;
}

function buildNetwork(input) {
  var cs = input.coreService;
  var stops = (cs && cs.stops) ? cs.stops : [];
  var links = (cs && cs.travelLinks) ? cs.travelLinks : [];
  var stopById = {};
  var i;
  for (i = 0; i < stops.length; i++) { stopById[stops[i].id] = stops[i]; }
  var linkByPair = {};
  for (i = 0; i < links.length; i++) {
    linkByPair[links[i].fromStopId + '|' + links[i].toStopId] = links[i];
  }
  return { stops: stops, stopById: stopById, linkByPair: linkByPair };
}

function buildVehicles(input, plan, effIdx, infeasibilities) {
  var vehicles = [];
  var cs = input.coreService;
  var coreTrips = (cs && cs.coreTrips) ? cs.coreTrips : [];
  var i, j;

  // Core trips are fixed and are never withdrawn by a BusAvailabilityDisruption.
  for (i = 0; i < coreTrips.length; i++) {
    var tr = coreTrips[i];
    var stops = [];
    var sts = tr.stopTimes || [];
    for (j = 0; j < sts.length; j++) {
      stops.push({
        stopId: sts[j].stopId,
        schedArrMs: msOf(sts[j].arrivalTime),
        schedDepMs: msOf(sts[j].departureTime),
        isDeadhead: false
      });
    }
    if (stops.length >= 2) {
      vehicles.push(newVehicle('core:' + tr.id, 'core', tr.capacity, stops));
    }
  }

  // Supplemental buses, exactly as planned. The engine never improvises an extra trip.
  var itineraries = plan.extraBusItineraries || [];
  for (i = 0; i < itineraries.length; i++) {
    var it = itineraries[i];
    var trips = it.trips || [];
    for (j = 0; j < trips.length; j++) {
      var trip = trips[j];
      var tstops = [];
      var ts = trip.stops || [];
      for (var k = 0; k < ts.length; k++) {
        tstops.push({
          stopId: ts[k].stopId,
          schedArrMs: msOf(ts[k].arrivalTime),
          schedDepMs: msOf(ts[k].departureTime),
          isDeadhead: ts[k].isDeadhead === true
        });
      }
      if (tstops.length < 2) { continue; }
      var veh = newVehicle('extra:' + it.busId + ':' + trip.tripId, 'extra', it.capacity, tstops);
      veh.busId = it.busId;
      if (closureOverlaps(effIdx.bus, it.busId,
        tstops[0].schedArrMs, tstops[tstops.length - 1].schedDepMs || tstops[tstops.length - 1].schedArrMs)) {
        veh.skipped = true;
        infeasibilities.push(issue('Error', 'BusWithdrawnAfterCutoff',
          'Bus ' + it.busId + ' was withdrawn during planned trip ' + trip.tripId
          + '. The trip did not run. The plan was not repaired, because repairing it would amount to live rerouting, which is out of scope.',
          'ExtraBus', it.busId));
      }
      vehicles.push(veh);
    }
  }

  // No bus may hold two overlapping trips; the planner must guarantee this and the engine checks it.
  var byBus = {};
  for (i = 0; i < vehicles.length; i++) {
    if (vehicles[i].kind !== 'extra') { continue; }
    var bid = vehicles[i].busId;
    if (!byBus[bid]) { byBus[bid] = []; }
    byBus[bid].push(vehicles[i]);
  }
  for (var b in byBus) {
    var list = byBus[b];
    list.sort(function (x, y) { return x.stops[0].schedArrMs - y.stops[0].schedArrMs; });
    for (i = 1; i < list.length; i++) {
      var prevEnd = list[i - 1].stops[list[i - 1].stops.length - 1].schedArrMs;
      if (list[i].stops[0].schedArrMs < prevEnd) {
        infeasibilities.push(issue('Error', 'OverlappingBusTrips',
          'Bus ' + b + ' has overlapping planned trips ' + list[i - 1].vid + ' and ' + list[i].vid + '.',
          'ExtraBus', b));
      }
    }
  }

  return vehicles;
}

function newVehicle(vid, kind, capacity, stops) {
  var servedAfter = [];
  for (var i = 0; i < stops.length; i++) {
    var set = {};
    for (var j = i + 1; j < stops.length; j++) {
      if (stops[j].isDeadhead !== true) { set[stops[j].stopId] = true; }
    }
    servedAfter.push(set);
  }
  return {
    vid: vid, kind: kind, capacity: capacity, stops: stops, servedAfter: servedAfter,
    onboard: [], load: 0, operatingMinutes: 0, deadheadMinutes: 0, dwellMinutes: 0,
    skipped: false, endedLoaded: false, busId: null
  };
}

function buildQueues(snapshot) {
  var queues = {};
  var journeys = snapshot.journeys || [];
  for (var i = 0; i < journeys.length; i++) {
    var j = journeys[i];
    if (!queues[j.originStopId]) { queues[j.originStopId] = []; }
    queues[j.originStopId].push({
      journeyId: j.journeyId,
      dest: j.destinationStopId,
      requestMs: msOf(j.requestTime),
      remaining: j.passengerCount,
      originalCount: j.passengerCount,
      hasDeadline: j.hasDeadline === true,
      deadlineMs: j.classDeadline ? msOf(j.classDeadline) : null,
      cohortId: j.cohortId
    });
  }
  // FIFO by request time within each stop. Journeys arrive pre-sorted, but sorting again keeps the
  // engine correct if a caller hands it an unsorted snapshot.
  for (var k in queues) {
    queues[k].sort(function (x, y) {
      var d = x.requestMs - y.requestMs;
      return d !== 0 ? d : (x.journeyId < y.journeyId ? -1 : 1);
    });
  }
  return queues;
}

function indexEffects(effects) {
  var idx = { link: {}, stop: {}, bus: {} };
  var put = function (bucket, ivs) {
    for (var i = 0; i < ivs.length; i++) {
      var iv = ivs[i];
      if (!bucket[iv.targetId]) { bucket[iv.targetId] = []; }
      bucket[iv.targetId].push({
        startMs: msOf(iv.intervalStart),
        endMs: msOf(iv.intervalEnd),
        multiplier: (iv.multiplier === null || iv.multiplier === undefined) ? 1.0 : iv.multiplier,
        isUnavailable: iv.isUnavailable === true
      });
    }
  };
  put(idx.link, effects.linkIntervals || []);
  put(idx.stop, effects.stopIntervals || []);
  put(idx.bus, effects.busIntervals || []);
  return idx;
}

function multiplierAt(bucket, targetId, atMs) {
  var ivs = bucket[targetId];
  if (!ivs) { return 1.0; }
  for (var i = 0; i < ivs.length; i++) {
    if (ivs[i].startMs <= atMs && ivs[i].endMs > atMs) { return ivs[i].multiplier; }
  }
  return 1.0;
}

function isUnavailable(bucket, targetId, atMs) {
  var ivs = bucket[targetId];
  if (!ivs) { return false; }
  for (var i = 0; i < ivs.length; i++) {
    if (ivs[i].isUnavailable && ivs[i].startMs <= atMs && ivs[i].endMs > atMs) { return true; }
  }
  return false;
}

function closureOverlaps(bucket, targetId, fromMs, toMs) {
  var ivs = bucket[targetId];
  if (!ivs) { return false; }
  for (var i = 0; i < ivs.length; i++) {
    if (ivs[i].isUnavailable && ivs[i].startMs < toMs && ivs[i].endMs > fromMs) { return true; }
  }
  return false;
}

function travelMinutes(net, fromStopId, toStopId, fromVisit, toVisit) {
  var link = net.linkByPair[fromStopId + '|' + toStopId];
  if (link) { return link.baselineTravelMinutes; }
  if (fromVisit.schedDepMs !== null && toVisit.schedArrMs !== null) {
    var scheduled = (toVisit.schedArrMs - fromVisit.schedDepMs) / 60000;
    if (scheduled > 0) { return scheduled; }
  }
  return 1.0;
}

function effectiveDwell(a, boarded, alighted) {
  var base = (a && a.defaultDwellMinutes !== null && a.defaultDwellMinutes !== undefined) ? a.defaultDwellMinutes : 0.5;
  var boardSec = (a && a.boardingSecondsPerPassenger) ? a.boardingSecondsPerPassenger : 0;
  var alightSec = (a && a.alightingSecondsPerPassenger) ? a.alightingSecondsPerPassenger : 0;
  var service = (boarded * boardSec + alighted * alightSec) / 60.0;
  return service > base ? service : base;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) { return null; }
  var idx = Math.ceil(p * sortedValues.length) - 1;
  if (idx < 0) { idx = 0; }
  if (idx >= sortedValues.length) { idx = sortedValues.length - 1; }
  return sortedValues[idx];
}

function issue(severity, code, message, refKind, refId) {
  return SimValidationIssue.make({
    severity: severity, code: code, message: message, refKind: refKind, refId: refId
  });
}

function round2(v) {
  if (v === null || v === undefined) { return null; }
  return Math.round(v * 100) / 100;
}

function msOf(dt) {
  if (dt === null || dt === undefined) { return null; }
  if (typeof dt === 'number') { return dt; }
  return dt.toDate().getTime();
}
