var HEURISTIC_VERSION = 'greedy-bottleneck-benefit-cost-1.0';
/** Most supplemental trips one bus may be given in a day. A modelling cap, not a physical law. */
var MAX_TRIPS_PER_BUS = 12;

function buildPlan(input, snapshot, plannerVisibleEffects, allocation, baselineResults) {
  var a = input.assumptions;
  var cfg = input.costConfig;
  var horizonEndMs = msOf(input.horizonEnd);
  var net = buildNetwork(input);
  var effIdx = indexEffects(plannerVisibleEffects);
  var explanations = [];
  var issues = [];

  var visibleEventIds = plannerVisibleEventIds(input);
  var alloc = (allocation === null || allocation === undefined || allocation < 0) ? 0 : allocation;
  var pool = input.extraBuses || [];
  if (alloc > pool.length) {
    issues.push(issue('Warning', 'AllocationExceedsPool',
      'Requested allocation ' + alloc + ' exceeds the available pool of ' + pool.length + ' buses; the plan uses the pool size.',
      'Scenario', input.scenarioId));
    alloc = pool.length;
  }

  var coreTripIds = [];
  if (input.coreService && input.coreService.coreTrips) {
    for (var ct = 0; ct < input.coreService.coreTrips.length; ct++) {
      coreTripIds.push(input.coreService.coreTrips[ct].id);
    }
  }
  coreTripIds.sort();

  explanations.push('Core MTD routes and timetables are FIXED and identical to the baseline. Only supplemental capacity is planned.');
  explanations.push('Planned once, at the start of day. The planner saw only the ' + visibleEventIds.length
    + ' event(s) with knownAt at or before the planning cutoff ' + input.planningCutoff.toString()
    + '. Disruptions that become known later are realized by the simulator but were not available here.');
  explanations.push('Heuristic ' + HEURISTIC_VERSION + ': rank baseline bottlenecks by waiting minutes, '
    + 'generate candidate trips, keep only feasible ones, and select greedily by estimated waiting minutes saved per unit cost. '
    + 'No optimality is claimed and results are not guaranteed to improve with more buses.');
  explanations.push('ADVISORY ONLY. This plan is a recommendation for a human to act on. Nothing here dispatches a bus or publishes to MTD.');

  if (alloc === 0) {
    explanations.push('Allocation is zero, so this plan is the fixed core service alone and must reproduce the mock old-model baseline exactly.');
    return SimPlan.make({
      planId: planId(input.scenarioId, 0),
      planKind: 'Candidate',
      scenarioId: input.scenarioId,
      allocation: 0,
      extraBusItineraries: [],
      coreTripIds: coreTripIds,
      planningCutoff: input.planningCutoff,
      eventIdsVisibleToPlanner: visibleEventIds,
      explanations: explanations,
      heuristicVersion: HEURISTIC_VERSION,
      validation: report(issues),
      totalOperatingCost: 0,
      busesUsed: 0,
      busesIdle: 0
    });
  }

  // Buses are taken in id order so allocation N is always the same N buses; that is what makes the
  // cost curve a curve over one consistent pool rather than over arbitrary subsets.
  var busStates = [];
  var i;
  for (i = 0; i < alloc; i++) {
    var bus = pool[i];
    busStates.push({
      bus: bus,
      index: i,
      posStopId: bus.startStopId,
      freeAtMs: msOf(bus.availableFrom),
      trips: [],
      used: false
    });
  }

  var bottlenecks = cloneBottlenecks(baselineResults);
  var eventAttribution = attributeEvents(input, snapshot, a);
  var tripCounter = 0;
  // Safety bound only. The real limits on a bus are its availability window, the minimum
  // turnaround, the deadhead it has to drive and the end of the horizon, all checked per candidate.
  // The per-bus cap matters: it must NOT be a shared budget, or one bus would absorb the trips that
  // a larger allocation is supposed to pay for and the cost curve would credit idle buses.
  var maxTrips = alloc * MAX_TRIPS_PER_BUS;
  var selectionLog = [];

  while (tripCounter < maxTrips) {
    var best = null;
    for (var bi = 0; bi < bottlenecks.length; bi++) {
      var bn = bottlenecks[bi];
      if (bn.remainingPax <= 0 || bn.avgWaitMinutes <= 0) { continue; }
      // Every destination wanted from this stop is considered, not just the most popular one.
      // Otherwise a smaller group travelling somewhere the core network cannot reach at all would
      // never be offered a trip.
      for (var di = 0; di < bn.destList.length; di++) {
        var destStopId = bn.destList[di];
        if (bn.destRemaining[destStopId] <= 0) { continue; }
        for (var si = 0; si < busStates.length; si++) {
          var cand = makeCandidate(input, net, effIdx, a, cfg, busStates[si], bn, destStopId, horizonEndMs);
          if (!cand) { continue; }
          if (cand.benefit <= 0) { continue; }
          if (best === null || cand.score > best.score
            || (cand.score === best.score && cand.serviceTimeMs < best.serviceTimeMs)) {
            best = cand;
          }
        }
      }
    }
    if (best === null) { break; }

    var state = best.busState;
    tripCounter++;
    var trip = SimItineraryTrip.make({
      tripId: 't_' + state.bus.id + '_' + (state.trips.length + 1),
      tripIndex: state.trips.length + 1,
      stops: best.stops,
      targetStopId: best.bottleneck.stopId,
      targetDestinationStopId: best.destStopId,
      targetWindowStart: DateTime.fromMillis(best.bottleneck.windowStartMs),
      targetWindowEnd: DateTime.fromMillis(best.bottleneck.windowEndMs),
      expectedBoardings: best.expectedBoardings,
      expectedWaitingMinutesSaved: round2(best.benefit),
      explanation: tripExplanation(best, eventAttribution, net)
    });
    state.trips.push({ trip: trip, metrics: best });
    state.used = true;
    state.posStopId = best.destStopId;
    state.freeAtMs = best.tripEndMs;

    best.bottleneck.remainingPax -= best.expectedBoardings;
    best.bottleneck.destRemaining[best.destStopId] -= best.expectedBoardings;
    best.bottleneck.waitMinutes -= best.benefit;
    if (best.bottleneck.waitMinutes < 0) { best.bottleneck.waitMinutes = 0; }

    selectionLog.push('Selected trip ' + trip.tripId + ' for bus ' + state.bus.id
      + ' targeting ' + best.bottleneck.stopId + ': estimated ' + round2(best.benefit)
      + ' waiting minutes saved for an estimated cost of ' + round2(best.cost)
      + ' ' + (cfg ? cfg.currency : '') + ' (benefit per unit cost ' + round2(best.score) + ').');
  }

  // Itineraries, including the allocated buses the heuristic chose not to use.
  var itineraries = [];
  var totalCost = 0;
  var busesUsed = 0;
  var busesIdle = 0;
  var includeIdle = cfg && cfg.includeIdleAllocatedBuses === true;

  for (i = 0; i < busStates.length; i++) {
    var st = busStates[i];
    var trips = [];
    var opMin = 0;
    var dhMin = 0;
    var dwMin = 0;
    for (var t = 0; t < st.trips.length; t++) {
      trips.push(st.trips[t].trip);
      opMin += st.trips[t].metrics.serviceMinutes;
      dhMin += st.trips[t].metrics.deadheadMinutes;
      dwMin += st.trips[t].metrics.dwellMinutes;
    }
    var cost = busCost(st.bus, cfg, st.used, opMin, dhMin, dwMin, includeIdle);
    totalCost += cost;
    if (st.used) { busesUsed++; } else { busesIdle++; }

    itineraries.push(SimBusItinerary.make({
      busId: st.bus.id,
      busLabel: st.bus.name,
      allocationIndex: st.index,
      capacity: st.bus.capacity,
      trips: trips,
      totalOperatingMinutes: round2(opMin),
      totalDeadheadMinutes: round2(dhMin),
      totalDwellMinutes: round2(dwMin),
      isIdle: !st.used,
      explanation: st.used
        ? 'Runs ' + trips.length + ' supplemental trip(s) selected by the benefit-per-cost heuristic.'
        : 'Allocated but left IDLE: no feasible trip for this bus had a positive estimated benefit. '
          + (includeIdle
            ? 'It is still charged its fixed allocation cost, because allocating a bus commits it.'
            : 'It is not charged, per the configured cost basis.'),
      operatingCost: round2(cost)
    }));
  }

  for (i = 0; i < selectionLog.length; i++) { explanations.push(selectionLog[i]); }
  if (busesIdle > 0) {
    explanations.push(busesIdle + ' of ' + alloc + ' allocated bus(es) were left idle because no feasible trip '
      + 'had a positive estimated benefit. Allocated, used and idle counts are reported separately so an '
      + 'unused bus is never mistaken for a working one.');
  }
  if (busesUsed === 0 && alloc > 0) {
    explanations.push('No supplemental trip was worth running at this allocation. The plan is therefore '
      + 'equivalent in service to the baseline but still carries allocation cost, which is exactly the '
      + 'kind of negative return the cost curve is meant to expose.');
  }

  return SimPlan.make({
    planId: planId(input.scenarioId, alloc),
    planKind: 'Candidate',
    scenarioId: input.scenarioId,
    allocation: alloc,
    extraBusItineraries: itineraries,
    coreTripIds: coreTripIds,
    planningCutoff: input.planningCutoff,
    eventIdsVisibleToPlanner: visibleEventIds,
    explanations: explanations,
    heuristicVersion: HEURISTIC_VERSION,
    validation: report(issues),
    totalOperatingCost: round2(totalCost),
    busesUsed: busesUsed,
    busesIdle: busesIdle
  });
}

function checkFeasibility(input, plan, effects) {
  var effIdx = indexEffects(effects);
  var out = [];
  var itineraries = plan.extraBusItineraries || [];
  for (var i = 0; i < itineraries.length; i++) {
    var it = itineraries[i];
    var trips = it.trips || [];
    for (var j = 0; j < trips.length; j++) {
      var stops = trips[j].stops || [];
      for (var k = 0; k < stops.length; k++) {
        if (stops[k].isDeadhead === true) { continue; }
        if (unavailableAt(effIdx.stop, stops[k].stopId, msOf(stops[k].arrivalTime))) {
          out.push(issue('Error', 'StopClosedUnderPlan',
            'Planned trip ' + trips[j].tripId + ' serves stop ' + stops[k].stopId + ' at '
            + stops[k].arrivalTime.toString() + ', but that stop is unavailable then. The closure was not '
            + 'visible at the planning cutoff, so the plan is reported infeasible rather than silently repaired.',
            'Stop', stops[k].stopId));
        }
      }
      if (stops.length > 0) {
        var from = msOf(stops[0].arrivalTime);
        var to = msOf(stops[stops.length - 1].departureTime || stops[stops.length - 1].arrivalTime);
        if (overlapsUnavailable(effIdx.bus, it.busId, from, to)) {
          out.push(issue('Error', 'BusWithdrawnAfterCutoff',
            'Bus ' + it.busId + ' is withdrawn during planned trip ' + trips[j].tripId
            + '. The trip cannot run. No replacement is substituted, because that would be live rerouting.',
            'ExtraBus', it.busId));
        }
      }
    }
  }
  return out;
}

function describeHeuristic() {
  return {
    heuristicVersion: HEURISTIC_VERSION,
    family: 'Greedy benefit-per-cost selection over baseline bottlenecks',
    steps: [
      '1. Simulate the mock old-model baseline and rank bottlenecks by total waiting minutes per origin stop and request-time window, with extra weight on passengers who have a class deadline.',
      '2. For each bottleneck, propose a trip to EACH destination its waiting passengers want, along the shortest path through the travel-link network, so a small group heading somewhere the core network cannot reach is still considered.',
      '3. Test feasibility against PLANNER-VISIBLE effects only: bus availability window, deadhead time from the bus current position, minimum turnaround, dwell, remaining capacity, no closed stop on the route at the time it would be served, and completion before the horizon ends.',
      '4. Score each feasible candidate as estimated waiting minutes saved divided by its marginal cost, then commit the best one and re-rank.',
      '5. Stop when the allocation is exhausted or no candidate has positive estimated benefit; remaining buses stay idle.',
      '6. Re-simulate the committed plan so reported figures are measured rather than estimated.'
    ],
    guarantees: [
      'Every emitted plan is feasible with respect to the information the planner was allowed to see.',
      'No bus is ever given two overlapping trips.',
      'Allocation zero reproduces the baseline exactly.',
      'Each bus is capped at ' + MAX_TRIPS_PER_BUS + ' supplemental trips per day, as a per-bus cap rather than a shared budget, so a larger allocation never gets credit for work one bus could have done alone.'
    ],
    explicitlyNotGuaranteed: [
      'Optimality. This is a greedy heuristic; a better plan may exist at the same allocation.',
      'Monotonicity. More buses can produce a worse outcome, for example by consuming cost without serving a bottleneck, and when that happens it is reported as measured.',
      'That the estimated benefit used for selection matches the re-simulated benefit; the re-simulation is authoritative.'
    ],
    limitations: [
      'Direct trips only: no transfers are planned or modelled, so demand between stop pairs with no path is reported unserved rather than routed.',
      'Trip departure is aimed at the end of the bottleneck window, which favours clearing an accumulated queue over smoothing demand as it arrives.',
      'Bottleneck ranking comes from a single baseline run, so interactions between two recommended trips are only captured by the re-simulation, not by the selection.',
      'Core routes and timetables are never modified and end-of-route changes made automatically by MTD are out of scope.'
    ],
    advisoryOnly: 'The planner emits recommendations. There is no dispatch and no publish action anywhere in this package.'
  };
}

// ---- local helpers ----

function planId(scenarioId, allocation) {
  return 'plan_' + scenarioId + '_alloc' + allocation;
}

/**
 * Builds one candidate trip for a (bus, bottleneck) pair, or null when nothing feasible fits.
 */
function makeCandidate(input, net, effIdx, a, cfg, busState, bn, destStopId, horizonEndMs) {
  var dwell = (a && a.defaultDwellMinutes) ? a.defaultDwellMinutes : 0.5;
  var turnaround = (a && a.minTurnaroundMinutes) ? a.minTurnaroundMinutes : 0;
  if (!destStopId || destStopId === bn.stopId) { return null; }
  if (busState.trips.length >= MAX_TRIPS_PER_BUS) { return null; }

  var path = shortestPath(net, bn.stopId, destStopId);
  if (!path) { return null; }

  var deadheadMinutes = 0;
  if (busState.posStopId !== bn.stopId) {
    deadheadMinutes = repositionMinutes(net, a, busState.posStopId, bn.stopId);
    if (deadheadMinutes === null) { return null; }
  }

  // Aim to serve at the end of the bottleneck window, by which point the queue has accumulated.
  var serviceTimeMs = bn.windowEndMs;
  var earliestStartMs = Math.max(msOf(busState.bus.availableFrom), busState.freeAtMs + Math.round(turnaround * 60000));
  var deadheadStartMs = serviceTimeMs - Math.round(deadheadMinutes * 60000);
  if (deadheadStartMs < earliestStartMs) {
    deadheadStartMs = earliestStartMs;
    serviceTimeMs = deadheadStartMs + Math.round(deadheadMinutes * 60000);
  }

  var stops = [];
  if (deadheadMinutes > 0) {
    stops.push(SimItineraryStop.make({
      stopId: busState.posStopId,
      arrivalTime: DateTime.fromMillis(deadheadStartMs),
      departureTime: DateTime.fromMillis(deadheadStartMs),
      stopSequenceIndex: 0,
      isDeadhead: true,
      plannedBoardings: 0,
      plannedAlightings: 0
    }));
  }

  var expectedBoardings = Math.min(busState.bus.capacity, bn.destRemaining[destStopId]);
  if (expectedBoardings <= 0) { return null; }

  var t = serviceTimeMs;
  var serviceMinutes = 0;
  var dwellMinutes = 0;
  for (var p = 0; p < path.stops.length; p++) {
    var stopId = path.stops[p];
    if (unavailableAt(effIdx.stop, stopId, t)) { return null; }
    var isFirst = p === 0;
    var isLast = p === path.stops.length - 1;
    var dep = t + Math.round(dwell * 60000);
    dwellMinutes += dwell;
    stops.push(SimItineraryStop.make({
      stopId: stopId,
      arrivalTime: DateTime.fromMillis(t),
      departureTime: DateTime.fromMillis(dep),
      stopSequenceIndex: stops.length,
      isDeadhead: false,
      plannedBoardings: isFirst ? expectedBoardings : 0,
      plannedAlightings: isLast ? expectedBoardings : 0
    }));
    if (!isLast) {
      var leg = path.legMinutes[p];
      var linkId = path.legLinkIds[p];
      var mult = linkId ? multiplierAtIdx(effIdx.link, linkId, dep) : 1.0;
      var realized = leg * mult;
      serviceMinutes += realized;
      t = dep + Math.round(realized * 60000);
    } else {
      t = dep;
    }
  }

  var tripEndMs = t;
  if (tripEndMs > msOf(busState.bus.availableTo)) { return null; }
  if (tripEndMs > horizonEndMs) { return null; }
  if (overlapsUnavailable(effIdx.bus, busState.bus.id, deadheadStartMs, tripEndMs)) { return null; }

  // Estimated saving: the passengers this trip can carry stop accruing their baseline wait and
  // instead wait only until this bus arrives.
  var windowMidMs = (bn.windowStartMs + bn.windowEndMs) / 2;
  var newWaitMinutes = (serviceTimeMs - windowMidMs) / 60000;
  if (newWaitMinutes < 0) { newWaitMinutes = 0; }
  var perPassengerSaving = bn.avgWaitMinutes - newWaitMinutes;
  if (perPassengerSaving <= 0) { return null; }
  var benefit = expectedBoardings * perPassengerSaving;

  var cost = busCost(busState.bus, cfg, true, serviceMinutes, deadheadMinutes, dwellMinutes,
    cfg && cfg.includeIdleAllocatedBuses === true)
    - (busState.used ? fixedCostOf(busState.bus, cfg) : 0);
  if (cost < 0.01) { cost = 0.01; }

  return {
    busState: busState,
    bottleneck: bn,
    destStopId: destStopId,
    stops: stops,
    serviceTimeMs: serviceTimeMs,
    tripEndMs: tripEndMs,
    serviceMinutes: serviceMinutes,
    deadheadMinutes: deadheadMinutes,
    dwellMinutes: dwellMinutes,
    expectedBoardings: expectedBoardings,
    benefit: benefit,
    cost: cost,
    score: benefit / cost,
    newWaitMinutes: newWaitMinutes
  };
}

function tripExplanation(cand, attribution, net) {
  var bn = cand.bottleneck;
  var key = bn.stopId + '|' + bn.windowStartMs;
  var causes = attribution[key];
  var stopName = net.stopById[bn.stopId] ? net.stopById[bn.stopId].name : bn.stopId;
  var destName = net.stopById[cand.destStopId] ? net.stopById[cand.destStopId].name : cand.destStopId;
  var text = 'Recommended because the baseline run leaves about ' + bn.remainingPax
    + ' passenger(s) at ' + stopName + ' (' + bn.destRemaining[cand.destStopId]
    + ' of them bound for ' + destName + ') between ' + DateTime.fromMillis(bn.windowStartMs).toString()
    + ' and ' + DateTime.fromMillis(bn.windowEndMs).toString()
    + ' waiting an average of ' + bn.avgWaitMinutes + ' minutes'
    + (bn.deadlineAtRisk > 0 ? ', including ' + bn.deadlineAtRisk + ' with a class deadline at risk' : '')
    + '. This trip carries up to ' + cand.expectedBoardings + ' of them to ' + destName
    + ', cutting their expected wait to about ' + round2(cand.newWaitMinutes) + ' minutes'
    + ' for an estimated ' + round2(cand.benefit) + ' waiting minutes saved.';
  if (causes && causes.length > 0) {
    text += ' That demand traces back to: ' + causes.join('; ') + '.';
  }
  text += ' Figures here are the planner estimate; the re-simulated result is authoritative.';
  return text;
}

/**
 * Maps each (stop, window) bucket to the events and estimates that generated its demand, so a
 * recommendation can say which event caused it rather than just how many people were waiting.
 */
function attributeEvents(input, snapshot, a) {
  var windowMs = ((a && a.stopDelayWindowMinutes) ? a.stopDelayWindowMinutes : 15) * 60000;
  var startMs = msOf(input.horizonStart);
  var nameById = {};
  var events = input.events || [];
  var i;
  for (i = 0; i < events.length; i++) { nameById[events[i].id] = events[i].name || events[i].id; }

  var byKey = {};
  var journeys = snapshot.journeys || [];
  for (i = 0; i < journeys.length; i++) {
    var j = journeys[i];
    var w = Math.floor((msOf(j.requestTime) - startMs) / windowMs);
    if (w < 0) { w = 0; }
    var key = j.originStopId + '|' + (startMs + w * windowMs);
    if (!byKey[key]) { byKey[key] = {}; }
    var label = j.sourceEventId
      ? ('event "' + (nameById[j.sourceEventId] || j.sourceEventId) + '" (' + j.sourceEventId + ', ' + j.legKind + ' leg)')
      : ('student-location estimate ' + j.sourceEstimateId + ' for cohort ' + j.cohortId);
    byKey[key][label] = (byKey[key][label] || 0) + j.passengerCount;
  }

  var out = {};
  for (var k in byKey) {
    var labels = [];
    for (var l in byKey[k]) {
      labels.push(l + ' contributing ' + byKey[k][l] + ' passenger(s)');
    }
    labels.sort();
    out[k] = labels;
  }
  return out;
}

function cloneBottlenecks(baselineResults) {
  var out = [];
  var replay = baselineResults ? baselineResults.replayFrames : null;
  var src = (replay && replay.bottlenecks) ? replay.bottlenecks : [];
  for (var i = 0; i < src.length; i++) {
    var b = src[i];
    var destCounts = {};
    var destRemaining = {};
    var destList = [];
    for (var d in b.destCounts) {
      destCounts[d] = b.destCounts[d];
      destRemaining[d] = b.destCounts[d];
      destList.push(d);
    }
    destList.sort();
    out.push({
      stopId: b.stopId,
      windowStartMs: b.windowStartMs,
      windowEndMs: b.windowEndMs,
      demandPax: b.demandPax,
      remainingPax: b.demandPax,
      unservedPax: b.unservedPax,
      deadlineAtRisk: b.deadlineAtRisk,
      waitMinutes: b.waitMinutes,
      avgWaitMinutes: b.avgWaitMinutes,
      destCounts: destCounts,
      destRemaining: destRemaining,
      destList: destList
    });
  }
  return out;
}

/** Dijkstra over the directed travel-link graph. Returns null when no path exists. */
function shortestPath(net, fromStopId, toStopId) {
  if (fromStopId === toStopId) { return null; }
  var dist = {};
  var prev = {};
  var prevLink = {};
  var visited = {};
  dist[fromStopId] = 0;
  var guard = 0;

  while (guard < 10000) {
    guard++;
    var cur = null;
    var curDist = null;
    for (var s in dist) {
      if (visited[s]) { continue; }
      if (curDist === null || dist[s] < curDist || (dist[s] === curDist && s < cur)) { cur = s; curDist = dist[s]; }
    }
    if (cur === null) { break; }
    if (cur === toStopId) { break; }
    visited[cur] = true;
    var out = net.linksFrom[cur] || [];
    for (var i = 0; i < out.length; i++) {
      var link = out[i];
      var nd = curDist + link.baselineTravelMinutes;
      if (dist[link.toStopId] === undefined || nd < dist[link.toStopId]) {
        dist[link.toStopId] = nd;
        prev[link.toStopId] = cur;
        prevLink[link.toStopId] = link.id;
      }
    }
  }

  if (dist[toStopId] === undefined) { return null; }
  var chain = [toStopId];
  var node = toStopId;
  var links = [];
  while (node !== fromStopId) {
    links.unshift(prevLink[node]);
    node = prev[node];
    chain.unshift(node);
    if (chain.length > 200) { return null; }
  }
  var legMinutes = [];
  var legLinkIds = [];
  for (var c = 0; c < chain.length - 1; c++) {
    var l = net.linkByPair[chain[c] + '|' + chain[c + 1]];
    legMinutes.push(l ? l.baselineTravelMinutes : 1.0);
    legLinkIds.push(l ? l.id : null);
  }
  legMinutes.push(0);
  legLinkIds.push(null);
  return { stops: chain, legMinutes: legMinutes, legLinkIds: legLinkIds, totalMinutes: dist[toStopId] };
}

/**
 * Minutes to reposition an out-of-service bus. Prefers the real network; falls back to straight-line
 * distance at the configured deadhead speed, which is an approximation and is documented as such.
 */
function repositionMinutes(net, a, fromStopId, toStopId) {
  if (fromStopId === toStopId) { return 0; }
  var path = shortestPath(net, fromStopId, toStopId);
  if (path) { return path.totalMinutes; }
  var f = net.stopById[fromStopId];
  var t = net.stopById[toStopId];
  if (!f || !t) { return null; }
  var speed = (a && a.deadheadSpeedKmPerHour) ? a.deadheadSpeedKmPerHour : 20;
  return (haversineKm(f.latitude, f.longitude, t.latitude, t.longitude) / speed) * 60;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  var r = 6371.0;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLon = (lon2 - lon1) * toRad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * r * Math.asin(Math.sqrt(h));
}

function fixedCostOf(bus, cfg) {
  if (bus.fixedCostPerDay !== null && bus.fixedCostPerDay !== undefined) { return bus.fixedCostPerDay; }
  return (cfg && cfg.fixedCostPerAllocatedBus) ? cfg.fixedCostPerAllocatedBus : 0;
}

function rateOf(busValue, cfgValue) {
  if (busValue !== null && busValue !== undefined) { return busValue; }
  return (cfgValue === null || cfgValue === undefined) ? 0 : cfgValue;
}

function busCost(bus, cfg, used, serviceMinutes, deadheadMinutes, dwellMinutes, includeIdle) {
  var fixed = (used || includeIdle) ? fixedCostOf(bus, cfg) : 0;
  if (!used) { return fixed; }
  var opRate = rateOf(bus.costPerOperatingMinute, cfg ? cfg.costPerOperatingMinute : 0);
  var dhRate = rateOf(bus.costPerDeadheadMinute, cfg ? cfg.costPerDeadheadMinute : 0);
  var dwRate = rateOf(bus.costPerDwellMinute, cfg ? cfg.costPerDwellMinute : 0);
  return fixed + serviceMinutes * opRate + deadheadMinutes * dhRate + dwellMinutes * dwRate;
}

function plannerVisibleEventIds(input) {
  var cutoffMs = msOf(input.planningCutoff);
  var out = [];
  var events = input.events || [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.canonicalEventId || ev.supersededByEventId) { continue; }
    if (msOf(ev.knownAt) <= cutoffMs) { out.push(ev.id); }
  }
  out.sort();
  return out;
}

function buildNetwork(input) {
  var cs = input.coreService;
  var stops = (cs && cs.stops) ? cs.stops : [];
  var links = (cs && cs.travelLinks) ? cs.travelLinks : [];
  var stopById = {};
  var linkByPair = {};
  var linksFrom = {};
  var i;
  for (i = 0; i < stops.length; i++) { stopById[stops[i].id] = stops[i]; }
  for (i = 0; i < links.length; i++) {
    var l = links[i];
    linkByPair[l.fromStopId + '|' + l.toStopId] = l;
    if (!linksFrom[l.fromStopId]) { linksFrom[l.fromStopId] = []; }
    linksFrom[l.fromStopId].push(l);
  }
  return { stops: stops, stopById: stopById, linkByPair: linkByPair, linksFrom: linksFrom };
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

function multiplierAtIdx(bucket, targetId, atMs) {
  var ivs = bucket[targetId];
  if (!ivs) { return 1.0; }
  for (var i = 0; i < ivs.length; i++) {
    if (ivs[i].startMs <= atMs && ivs[i].endMs > atMs) { return ivs[i].multiplier; }
  }
  return 1.0;
}

function unavailableAt(bucket, targetId, atMs) {
  var ivs = bucket[targetId];
  if (!ivs) { return false; }
  for (var i = 0; i < ivs.length; i++) {
    if (ivs[i].isUnavailable && ivs[i].startMs <= atMs && ivs[i].endMs > atMs) { return true; }
  }
  return false;
}

function overlapsUnavailable(bucket, targetId, fromMs, toMs) {
  var ivs = bucket[targetId];
  if (!ivs) { return false; }
  for (var i = 0; i < ivs.length; i++) {
    if (ivs[i].isUnavailable && ivs[i].startMs < toMs && ivs[i].endMs > fromMs) { return true; }
  }
  return false;
}

function report(issues) {
  var errorCount = 0;
  var warningCount = 0;
  for (var i = 0; i < issues.length; i++) {
    if (issues[i].severity === 'Error') { errorCount++; }
    else if (issues[i].severity === 'Warning') { warningCount++; }
  }
  return SimValidationReport.make({
    isValid: errorCount === 0, issues: issues, errorCount: errorCount, warningCount: warningCount
  });
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
