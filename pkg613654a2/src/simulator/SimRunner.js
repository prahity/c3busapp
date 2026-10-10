var CONTRACT_VERSION = '1.0.0';
var SYNTHETIC_LABEL = 'SIMULATED - SYNTHETIC MOCK DATA - NOT LIVE MTD DATA';

function runComparison(scenarioId, maxExtraBuses) {
  var input = SimInputAssembler.assemble(scenarioId);
  var cap = (maxExtraBuses === null || maxExtraBuses === undefined || maxExtraBuses < 0)
    ? input.maxExtraBuses : Math.min(maxExtraBuses, input.maxExtraBuses);
  if (cap === null || cap === undefined || cap < 0) { cap = 0; }
  var allocations = [];
  for (var i = 0; i <= cap; i++) { allocations.push(i); }
  return execute(input, allocations);
}

function runAllocation(scenarioId, allocation) {
  var input = SimInputAssembler.assemble(scenarioId);
  var alloc = (allocation === null || allocation === undefined || allocation < 0) ? 0 : allocation;
  return execute(input, [alloc]);
}

function exportBundle(scenarioId, maxExtraBuses) {
  var comparison = runComparison(scenarioId, maxExtraBuses);
  return {
    contractVersion: CONTRACT_VERSION,
    syntheticDataLabel: SYNTHETIC_LABEL,
    exportedAt: DateTime.now().toString(),
    scope: describeScope(),
    units: {
      time: 'All user-facing durations are MINUTES.',
      timestamps: 'All instants are absolute datetimes; the service date and timezone are on the scenario.',
      money: 'Costs carry an explicit currency on SimCostConfig and on every cost-bearing record.',
      confidenceAndReliability: 'Confidence and reliability are on a 0-1 scale and are NOT calibrated probabilities.'
    },
    // The original event collection is exported alongside everything derived from it, so a consumer
    // can audit how an event became demand, a plan and a result.
    events: eventsJson(comparison.input),
    assembledInput: comparison.input.toJson(),
    demandSnapshot: comparison.demandSnapshot.toJson(),
    realizedEffects: comparison.realizedEffects.toJson(),
    reconciliation: comparison.input.reconciliation ? comparison.input.reconciliation.toJson() : null,
    validation: comparison.input.validation ? comparison.input.validation.toJson() : null,
    baseline: comparison.baseline ? comparison.baseline.toJson() : null,
    candidates: jsonList(comparison.candidates),
    plans: jsonList(comparison.plans),
    costCurve: jsonList(comparison.costCurve),
    comparabilityAssertions: comparison.comparabilityAssertions,
    heuristic: SimPlanner.describeHeuristic(),
    baselineModel: SimOldModelBaseline.describe(),
    stopDelayExportNote: 'In stopWindowDelays, hasObservations=false means NO passenger was observed in '
      + 'that window and estimatedWaitMinutes is null. Absence of observations is NEVER encoded as a '
      + 'zero wait. Consumers must render it as "no data", not as "no delay".',
    futureIntegrationBoundary: {
      purpose: 'Export boundary only for a FUTURE Google Maps style student-facing integration. '
        + 'Nothing in this package calls an external mapping service.',
      shape: 'stopWindowDelays[] from each SimResults: {stopId, stopName, windowStart, windowEnd, '
        + 'estimatedWaitMinutes|null, supportingPassengerCount, hasObservations, censoredPassengerCount, '
        + 'maxWaitMinutes, stopUnavailableInWindow}',
      labelling: 'Any consumer MUST present these as SIMULATED estimates, not live predictions.'
    }
  };
}

function listScenarios() {
  var r = SimScenario.fetch({ order: 'id', limit: -1 });
  var out = [];
  for (var i = 0; i < r.objs.length; i++) { out.push(r.objs[i]); }
  return out;
}

function eventTimeline(scenarioId) {
  var input = SimInputAssembler.assemble(scenarioId);
  var cutoffMs = msOf(input.planningCutoff);
  var plannerEffects = SimEffects.resolve(input.events, input.assumptions, input.planningCutoff, true);
  var realizedEffects = SimEffects.resolve(input.events, input.assumptions, input.planningCutoff, false);

  var stops = [];
  var links = [];
  var cs = input.coreService;
  var i;
  if (cs) {
    for (i = 0; i < (cs.stops || []).length; i++) {
      var s = cs.stops[i];
      stops.push({
        id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude,
        isCoreStop: s.isCoreStop === true, stopCode: s.stopCode
      });
    }
    for (i = 0; i < (cs.travelLinks || []).length; i++) {
      var l = cs.travelLinks[i];
      links.push({
        id: l.id, fromStopId: l.fromStopId, toStopId: l.toStopId,
        baselineTravelMinutes: l.baselineTravelMinutes, distanceKm: l.distanceKm
      });
    }
  }

  return {
    contractVersion: CONTRACT_VERSION,
    syntheticDataLabel: SYNTHETIC_LABEL,
    scenarioId: input.scenarioId,
    serviceDate: input.serviceDate,
    serviceTimezone: input.serviceTimezone,
    horizonStart: input.horizonStart.toString(),
    horizonEnd: input.horizonEnd.toString(),
    planningCutoff: input.planningCutoff.toString(),
    planningCutoffNote: 'Events with knownAt at or before the cutoff are visible to the planner. '
      + 'Later events are still realized by the simulator but the planner never sees them and buses '
      + 'are never rerouted live.',
    events: eventsJson(input),
    stops: stops,
    travelLinks: links,
    plannerVisibleEffects: plannerEffects.toJson(),
    realizedEffects: realizedEffects.toJson(),
    effectCombination: {
      rule: input.assumptions ? input.assumptions.overlappingMultiplierRule : null,
      maxMultiplier: input.assumptions ? input.assumptions.maxTravelTimeMultiplier : null,
      explanation: 'Overlapping effects on the same target are resolved by a breakpoint sweep into '
        + 'disjoint intervals. Travel-time multipliers on one link combine by the configured rule '
        + '(Multiply or Max) and are clamped at maxTravelTimeMultiplier. Unavailability is a union: '
        + 'any overlapping unavailability makes the target unavailable, and unavailability dominates '
        + 'any travel-time multiplier on the same target and interval.'
    },
    eventCategories: eventCategoryCatalog(),
    editableFeed: {
      upsert: 'SimEventFeedAdapter.upsertEvent(event)',
      remove: 'SimEventFeedAdapter.removeEvent(eventId)',
      read: 'SimEventFeedAdapter.getEvents(scenarioId)',
      note: 'This is a MOCK, editable feed. Another team will supply the real event collection; '
        + 'replace this adapter without touching the engine.'
    },
    cutoffMillis: cutoffMs
  };
}

function describeScope() {
  return {
    contractVersion: CONTRACT_VERSION,
    syntheticDataLabel: SYNTHETIC_LABEL,
    purpose: 'Advisory bus-capacity planning for Transport X / Illini-X over MTD service. It answers '
      + '"what would happen without changes" versus "what would happen with N additional buses", so a '
      + 'human can decide how many extra buses to allocate and where they should run.',
    inScope: [
      'Planning supplemental capacity ONCE, at the start of the service day.',
      'Per-bus ordered itineraries with times, capacity and an explanation of why each trip is recommended.',
      'Cost versus time saved across 0..max extra buses, including diminishing and negative returns.',
      'Proactive baseline-versus-recommendation comparison on identical demand and identical realized events.',
      'Student-facing expected delay by stop and time window, as an export boundary only.'
    ],
    outOfScope: [
      'Live rerouting. Explicitly rejected. Plans are fixed at the cutoff and never adapt mid-day.',
      'Changing core MTD routes or timetables. These are FIXED and identical across every simulation.',
      'Automatic route changes MTD makes at end stops. Not tracked.',
      'Dispatching buses or publishing anything to MTD. There is no such action anywhere in this package.',
      'Transfers. Only direct origin-to-destination trips are modelled.',
      'Live LLM calls, live scraping or any external credential. Every source is a mock adapter.',
      'Calling a mapping provider. Only the export shape for a future integration exists.'
    ],
    dataLabelling: 'Every scenario, stop, event, estimate, report, score and bus in this package is '
      + 'SYNTHETIC. Cohorts are synthetic aggregates with no personal data of any kind.',
    keyAssumptionsNote: 'Dwell, boarding and alighting rates, reliability policy, overlap rules, '
      + 'queue discipline, arrival spread, deadhead speed and turnaround all live on SimAssumptions '
      + 'per scenario. No mock value is hidden inside the engine or the interface.',
    reliabilityNote: 'Confidence and reputation are combined into a 0-1 weight by the configured '
      + 'reliability policy. That weight scales expected demand. It is NOT a calibrated probability '
      + 'and must not be read as one. Low-confidence events are retained and down-weighted, never discarded.',
    savingsNote: 'Savings are baseline minus candidate and are NOT clamped, so a candidate that is '
      + 'worse than the baseline reports a negative saving. Cost per waiting minute saved is reported '
      + 'as unavailable with a reason whenever savings are zero or negative.'
  };
}

// ---- local helpers ----

/**
 * The single place a comparison is produced. Everything downstream of the snapshot is driven from
 * exactly one SimDemandSnapshot object and exactly one realized SimResolvedEffects object, passed by
 * reference, so baseline and every candidate necessarily experience the same day.
 */
function execute(input, allocations) {
  var now = DateTime.now();
  var hit = SimScenario.fetch({ filter: Filter.eq('id', input.scenarioId), limit: 1 });
  var scenarioName = hit.objs.length > 0 ? hit.objs[0].name : input.scenarioId;

  if (input.validation && input.validation.errorCount > 0) {
    return SimComparison.make({
      scenarioId: input.scenarioId,
      scenarioName: scenarioName,
      contractVersion: CONTRACT_VERSION,
      input: input,
      comparabilityAssertions: ['NOT RUN: the assembled input failed validation with '
        + input.validation.errorCount + ' error(s). No simulation was attempted, because running on '
        + 'invalid input would produce numbers that look authoritative and are not.'],
      scopeNotes: ['Validation errors are listed on input.validation.issues.'],
      syntheticDataLabel: SYNTHETIC_LABEL,
      computedAt: now
    });
  }

  // Generated ONCE. Shared by reference, not regenerated from the same seed, because a different
  // event-consumption order could otherwise change demand between plans.
  var snapshot = SimDemandGenerator.generate(input);

  var plannerEffects = SimEffects.resolve(input.events, input.assumptions, input.planningCutoff, true);
  var realizedEffects = SimEffects.resolve(input.events, input.assumptions, input.planningCutoff, false);

  var basePlan = SimOldModelBaseline.baselinePlan(input);
  var baseResults = SimEngine.run(input, snapshot, basePlan, realizedEffects);
  baseResults = finalizeMetrics(baseResults, input, basePlan, null);

  var plans = [basePlan];
  var candidates = [];
  var costCurve = [];
  var i;

  for (i = 0; i < allocations.length; i++) {
    var alloc = allocations[i];
    var plan = SimPlanner.buildPlan(input, snapshot, plannerEffects, alloc, baseResults);
    var infeasibilities = SimPlanner.checkFeasibility(input, plan, realizedEffects);
    var results = SimEngine.run(input, snapshot, plan, realizedEffects);
    if (infeasibilities.length > 0) {
      var merged = (results.infeasibilities || []).concat(infeasibilities);
      results = results.withInfeasibilities(merged);
    }
    results = finalizeMetrics(results, input, plan, baseResults);
    plans.push(plan);
    candidates.push(results);
    costCurve.push(curvePoint(plan, results, input));
  }

  return SimComparison.make({
    scenarioId: input.scenarioId,
    scenarioName: scenarioName,
    contractVersion: CONTRACT_VERSION,
    input: input,
    demandSnapshot: snapshot,
    realizedEffects: realizedEffects,
    baseline: baseResults,
    candidates: candidates,
    plans: plans,
    costCurve: costCurve,
    comparabilityAssertions: assertComparability(input, snapshot, realizedEffects, basePlan, baseResults, plans, candidates),
    heuristicNotes: heuristicNotes(),
    scopeNotes: scopeNotes(input, plannerEffects, realizedEffects),
    syntheticDataLabel: SYNTHETIC_LABEL,
    computedAt: now
  });
}

/**
 * Fills in the figures that only make sense relative to the baseline. The engine deliberately does
 * not compute these, because it only ever sees one run at a time.
 */
function finalizeMetrics(results, input, plan, baseResults) {
  var cfg = input.costConfig;
  var currency = cfg ? cfg.currency : null;
  var cost = (plan.totalOperatingCost === null || plan.totalOperatingCost === undefined) ? 0 : plan.totalOperatingCost;
  var m = results.metrics;

  var saved;
  var reason = null;
  var cpm = null;

  if (baseResults === null) {
    saved = 0;
    reason = 'BaselineRun';
  } else {
    // Unclamped on purpose: a worse-than-baseline candidate must show a negative saving.
    saved = baseResults.metrics.horizonTotalWaitingMinutes - m.horizonTotalWaitingMinutes;
    if (saved > 0) {
      cpm = round2(cost / saved);
    } else if (saved === 0) {
      reason = 'ZeroSavings: this plan removed no waiting minutes relative to the mock old-model '
        + 'baseline, so cost per waiting minute saved is undefined. Cost incurred was ' + round2(cost)
        + ' ' + currency + '.';
    } else {
      reason = 'NegativeSavings: this plan added ' + round2(-saved) + ' waiting minutes relative to '
        + 'the mock old-model baseline while costing ' + round2(cost) + ' ' + currency
        + '. A cost per minute saved would be meaningless and is therefore not reported.';
    }
  }

  m = m.withHorizonWaitingMinutesSavedVsBaseline(round2(saved))
    .withExtraBusOperatingCost(round2(cost))
    .withCurrency(currency)
    .withCostPerWaitingMinuteSaved(cpm)
    .withCostPerMinuteSavedUnavailableReason(reason);

  return results.withMetrics(m);
}

function curvePoint(plan, results, input) {
  var m = results.metrics;
  return SimCostCurvePoint.make({
    allocation: plan.allocation,
    operatingCost: m.extraBusOperatingCost,
    currency: m.currency,
    horizonTotalWaitingMinutes: m.horizonTotalWaitingMinutes,
    horizonWaitingMinutesSaved: m.horizonWaitingMinutesSavedVsBaseline,
    avgWaitMinutesCompleted: m.avgWaitMinutesCompleted,
    p95WaitMinutesCompleted: m.p95WaitMinutesCompleted,
    lateCompletedPassengers: m.lateCompletedPassengers,
    lateCompletedPct: m.lateCompletedPct,
    unservedPassengers: m.unservedAtHorizon,
    costPerWaitingMinuteSaved: m.costPerWaitingMinuteSaved,
    costPerMinuteSavedUnavailableReason: m.costPerMinuteSavedUnavailableReason,
    busesUsed: plan.busesUsed,
    busesIdle: plan.busesIdle,
    planId: plan.planId,
    resultsId: results.resultsId
  });
}

/**
 * Verifies, rather than asserts by documentation, that every run in this comparison saw the same
 * demand, the same realized events and the same fixed core service.
 */
function assertComparability(input, snapshot, realizedEffects, basePlan, baseResults, plans, candidates) {
  var out = [];
  var i;

  // 1. One demand snapshot, shared by reference.
  var snapOk = baseResults.snapshotId === snapshot.snapshotId;
  for (i = 0; i < candidates.length; i++) {
    if (candidates[i].snapshotId !== snapshot.snapshotId) { snapOk = false; }
  }
  out.push((snapOk ? 'PASS' : 'FAIL') + ' - Identical demand snapshot: every run references snapshot '
    + snapshot.snapshotId + ' (' + snapshot.totalPassengers + ' passengers across '
    + snapshot.journeys.length + ' journey groups). The snapshot is generated once and passed by '
    + 'reference, not regenerated from the same seed.');

  // 2. Same passenger population actually entered each run.
  var genOk = baseResults.accounting.generatedPassengers === snapshot.totalPassengers;
  for (i = 0; i < candidates.length; i++) {
    if (candidates[i].accounting.generatedPassengers !== snapshot.totalPassengers) { genOk = false; }
  }
  out.push((genOk ? 'PASS' : 'FAIL') + ' - Identical generated demand: all runs generated exactly '
    + snapshot.totalPassengers + ' passengers.');

  // 3. Same realized events in every run.
  var evOk = true;
  var expectedEvents = (realizedEffects.contributingEventIds || []).join(',');
  var baseEvents = activationIds(baseResults);
  for (i = 0; i < candidates.length; i++) {
    if (activationIds(candidates[i]) !== baseEvents) { evOk = false; }
  }
  out.push((evOk ? 'PASS' : 'FAIL') + ' - Identical event realization: baseline and all '
    + candidates.length + ' candidate run(s) report the same activated events (' + (baseEvents || 'none')
    + '). Operational effects contributed by events: ' + (expectedEvents || 'none') + '.');

  // 4. Core service fixed across all plans.
  var coreOk = true;
  var baseCore = (basePlan.coreTripIds || []).join(',');
  for (i = 0; i < plans.length; i++) {
    if ((plans[i].coreTripIds || []).join(',') !== baseCore) { coreOk = false; }
  }
  out.push((coreOk ? 'PASS' : 'FAIL') + ' - Fixed core service: all ' + plans.length
    + ' plan(s) run the identical set of ' + (basePlan.coreTripIds || []).length
    + ' core MTD trips. Only supplemental capacity differs.');

  // 5. Allocation zero must reproduce the baseline exactly.
  var zero = null;
  for (i = 0; i < candidates.length; i++) {
    if (candidates[i].allocation === 0) { zero = candidates[i]; }
  }
  if (zero === null) {
    out.push('NOT CHECKED - Allocation zero was not among the requested allocations, so the '
      + 'zero-equals-baseline check did not run.');
  } else {
    var bm = baseResults.metrics;
    var zm = zero.metrics;
    var same = bm.horizonTotalWaitingMinutes === zm.horizonTotalWaitingMinutes
      && bm.completedPassengers === zm.completedPassengers
      && bm.unservedAtHorizon === zm.unservedAtHorizon
      && bm.lateCompletedPassengers === zm.lateCompletedPassengers;
    out.push((same ? 'PASS' : 'FAIL') + ' - Zero extra buses equals baseline: the zero-allocation '
      + 'candidate reproduces the mock old-model baseline exactly ('
      + zm.horizonTotalWaitingMinutes + ' horizon waiting minutes, ' + zm.completedPassengers
      + ' completed, ' + zm.unservedAtHorizon + ' unserved, ' + zm.lateCompletedPassengers + ' late).');
  }

  // 6. Planner knowledge boundary.
  var hidden = snapshot.eventIdsUnknownAtCutoff || [];
  var leak = false;
  for (i = 0; i < plans.length; i++) {
    var vis = plans[i].eventIdsVisibleToPlanner || [];
    for (var h = 0; h < hidden.length; h++) {
      for (var v = 0; v < vis.length; v++) { if (vis[v] === hidden[h]) { leak = true; } }
    }
  }
  out.push((leak ? 'FAIL' : 'PASS') + ' - Planning cutoff respected: ' + hidden.length
    + ' event(s) became known after the cutoff (' + (hidden.join(',') || 'none')
    + ') and none of them appears in any plan\'s planner-visible set. The simulator still realizes them.');

  // 7. Accounting balance.
  var balOk = baseResults.accounting.isBalanced === true;
  for (i = 0; i < candidates.length; i++) {
    if (candidates[i].accounting.isBalanced !== true) { balOk = false; }
  }
  out.push((balOk ? 'PASS' : 'FAIL') + ' - Accounting balanced in every run: generated = completed + '
    + 'waiting at horizon + onboard at horizon + denied by closure. No passenger is dropped or invented.');

  return out;
}

function activationIds(results) {
  var acts = results.eventActivations || [];
  var ids = [];
  for (var i = 0; i < acts.length; i++) { ids.push(acts[i].eventId); }
  ids.sort();
  return ids.join(',');
}

function heuristicNotes() {
  return [
    'The planner is a greedy benefit-per-cost heuristic. It is NOT optimal and no claim of optimality is made.',
    'Results are NOT guaranteed to improve monotonically with more buses. An allocation that costs more '
      + 'and saves less than a smaller one is reported exactly as measured.',
    'Allocated buses may be left idle. Allocated, used and idle counts are separate, and under the '
      + 'default cost basis an idle allocated bus still carries its fixed cost.',
    'Selection uses an estimate; every reported figure comes from re-simulating the committed plan.',
    'Only direct trips are planned. Demand between stop pairs with no path through the travel-link '
      + 'network is reported unserved rather than routed via a transfer.'
  ];
}

function scopeNotes(input, plannerEffects, realizedEffects) {
  var notes = [];
  notes.push('ADVISORY ONLY. Nothing in this comparison dispatches a bus or publishes to MTD.');
  notes.push('Core MTD routes and timetables are fixed and identical in every run.');
  notes.push('Planned once at ' + input.planningCutoff.toString() + '. No live rerouting.');
  notes.push('Planner-visible operational intervals: ' + intervalCount(plannerEffects)
    + '; realized operational intervals: ' + intervalCount(realizedEffects)
    + '. The difference is exactly what the planner was not allowed to know.');
  notes.push('All durations are minutes. Costs are in ' + (input.costConfig ? input.costConfig.currency : 'an unspecified currency') + '.');
  notes.push(SYNTHETIC_LABEL);
  return notes;
}

function intervalCount(effects) {
  return (effects.linkIntervals || []).length + (effects.stopIntervals || []).length
    + (effects.busIntervals || []).length;
}

/**
 * The event collection in its original form - timing, location, provenance, reliability and effects
 * all preserved. Events are deliberately NOT reduced to passenger counts here.
 */
function eventsJson(input) {
  var out = [];
  var events = input.events || [];
  var cutoffMs = msOf(input.planningCutoff);
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    // toJson() returns an immutable TurboJs object that rejects property assignment, so copy it
    // into a plain object before annotating. Mutating the result directly throws
    // UnsupportedOperationException and previously broke both eventTimeline and exportBundle.
    var j = JSON.parse(JSON.stringify(ev.toJson()));
    j.visibleToPlanner = msOf(ev.knownAt) <= cutoffMs && !ev.canonicalEventId && !ev.supersededByEventId;
    j.isSuppressedDuplicate = !!(ev.canonicalEventId || ev.supersededByEventId);
    out.push(j);
  }
  return out;
}

function eventCategoryCatalog() {
  return {
    note: 'These are CONFIGURABLE MOCK CATEGORIES, not claims about the real event feed. The engine '
      + 'never branches on eventType; it reads demandEffect and operationalEffects, so another team '
      + 'can add categories without touching the simulation.',
    categories: [
      {
        eventType: 'ClassOrGathering',
        demandEffect: 'Inbound travel before the start time and outbound travel after the end time, '
          + 'controlled by generatesInbound / generatesOutbound and the window offsets.',
        operationalEffect: 'None unless explicitly configured.'
      },
      {
        eventType: 'LargeEvent',
        demandEffect: 'Attendance-driven surge: attendance x busUseShare x reliability weight, spread '
          + 'over the arrival or departure window and apportioned over the origin and destination distributions.',
        operationalEffect: 'Optional congestion, expressed as a TravelTimeMultiplier on nearby links.'
      },
      {
        eventType: 'TrafficDisruption',
        demandEffect: 'Usually none.',
        operationalEffect: 'TravelTimeMultiplier on the listed travel links during the window.'
      },
      {
        eventType: 'StopClosure',
        demandEffect: 'Passengers may need a different stop, but ONLY when a fallbackStopId was '
          + 'configured before the planning cutoff. Otherwise no relocation is invented.',
        operationalEffect: 'StopUnavailable: the stop cannot be served in the window. Affected plans '
          + 'are reported infeasible rather than silently repaired.'
      },
      {
        eventType: 'BusAvailabilityDisruption',
        demandEffect: 'None.',
        operationalEffect: 'BusUnavailable: the listed extra buses cannot run in the window.'
      }
    ],
    demandEventFields: ['demandEffect.attendance', 'demandEffect.busUseShare',
      'demandEffect.originDistribution', 'demandEffect.destinationDistribution',
      'demandEffect.inboundWindowStartOffsetMin', 'demandEffect.inboundWindowEndOffsetMin',
      'demandEffect.outboundWindowStartOffsetMin', 'demandEffect.outboundWindowEndOffsetMin',
      'demandEffect.classDeadlineOffsetMin', 'demandEffect.cohortId'],
    operationalEventFields: ['operationalEffects[].effectKind', 'operationalEffects[].windowStart',
      'operationalEffects[].windowEnd', 'operationalEffects[].travelTimeMultiplier',
      'operationalEffects[].linkIds', 'operationalEffects[].stopIds', 'operationalEffects[].busIds',
      'operationalEffects[].fallbackStopId']
  };
}

function jsonList(items) {
  var out = [];
  var list = items || [];
  for (var i = 0; i < list.length; i++) { out.push(list[i].toJson()); }
  return out;
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
