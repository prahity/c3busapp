var CONTRACT_VERSION = '1.0.0';
var SYNTHETIC_LABEL = 'SIMULATED - synthetic mock data, not MTD operational data';

function assemble(scenarioId) {
  var scenarioHit = SimScenario.fetch({ filter: Filter.eq('id', scenarioId), limit: 1 });
  var scenario = scenarioHit.objs.length > 0 ? scenarioHit.objs[0] : null;
  if (!scenario) {
    throw new Error('Unknown scenarioId: ' + scenarioId);
  }

  var assumptions = scenario.assumptions || defaultAssumptions();
  var costConfig = scenario.costConfig || defaultCostConfig();

  var events = SimEventFeedAdapter.getEvents(scenarioId);
  var estimates = SimStudentLocationAdapter.getEstimates(scenarioId);
  var eventEstimates = SimEventEstimateAdapter.getEventEstimates(scenarioId);
  var reports = SimEventReportAdapter.getReports(scenarioId);
  var scores = SimReputationAdapter.getScores(scenarioId);
  var coreService = SimCoreServiceAdapter.getCoreService(scenarioId);
  var extraBuses = SimBusAvailabilityAdapter.getExtraBuses(scenarioId);

  var poolSize = extraBuses ? extraBuses.length : 0;
  var maxExtraBuses = scenario.maxExtraBuses;
  if (maxExtraBuses === null || maxExtraBuses === undefined || maxExtraBuses > poolSize) {
    maxExtraBuses = poolSize;
  }

  var trace = reconcile(events, estimates, reports, scores, assumptions, scenarioId);

  var input = SimulationInput.make({
    contractVersion: CONTRACT_VERSION,
    scenarioId: scenarioId,
    serviceDate: scenario.serviceDate,
    serviceTimezone: scenario.serviceTimezone,
    horizonStart: scenario.horizonStart,
    horizonEnd: scenario.horizonEnd,
    planningCutoff: scenario.planningCutoff,
    randomSeed: scenario.randomSeed,
    maxExtraBuses: maxExtraBuses,
    events: events,
    studentLocationEstimates: estimates,
    eventEstimates: eventEstimates,
    eventReports: reports,
    reputationScores: scores,
    coreService: coreService,
    extraBuses: extraBuses,
    costConfig: costConfig,
    assumptions: assumptions,
    reconciliation: trace,
    syntheticDataLabel: scenario.syntheticDataLabel || SYNTHETIC_LABEL,
    assembledAt: DateTime.now()
  });

  return input.withValidation(validate(input));
}

function plannerVisibleEvents(input) {
  var cutoffMs = msOf(input.planningCutoff);
  var all = input.events || [];
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (e.canonicalEventId || e.supersededByEventId) { continue; }
    if (msOf(e.knownAt) <= cutoffMs) { out.push(e); }
  }
  out.sort(function (a, b) {
    var d = msOf(a.startTime) - msOf(b.startTime);
    return d !== 0 ? d : (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
  });
  return out;
}

function validate(input) {
  var issues = [];
  var a = input.assumptions || defaultAssumptions();
  var cs = input.coreService;

  var stopIds = {};
  var linkIds = {};
  var routeIds = {};
  var busIds = {};
  var i, j;

  if (cs && cs.stops) { for (i = 0; i < cs.stops.length; i++) { stopIds[cs.stops[i].id] = true; } }
  if (cs && cs.travelLinks) { for (i = 0; i < cs.travelLinks.length; i++) { linkIds[cs.travelLinks[i].id] = true; } }
  if (cs && cs.routes) { for (i = 0; i < cs.routes.length; i++) { routeIds[cs.routes[i].id] = true; } }
  if (input.extraBuses) { for (i = 0; i < input.extraBuses.length; i++) { busIds[input.extraBuses[i].id] = true; } }

  var horizonStart = msOf(input.horizonStart);
  var horizonEnd = msOf(input.horizonEnd);
  var cutoff = msOf(input.planningCutoff);

  if (horizonEnd <= horizonStart) {
    issues.push(issue('Error', 'TimeOrdering', 'horizonEnd must be after horizonStart.', 'Scenario', input.scenarioId));
  }
  if (cutoff > horizonEnd) {
    issues.push(issue('Error', 'TimeOrdering', 'planningCutoff must not be after horizonEnd.', 'Scenario', input.scenarioId));
  }

  // Transfers are not modelled. Accepting the flag silently would make every unserved
  // origin-destination pair look like a capacity problem instead of a scope limitation.
  if (a.allowTransfers === true) {
    issues.push(issue('Error', 'TransfersNotSupported',
      'SimAssumptions.allowTransfers is true but the engine models direct trips only. Set it to false.',
      'Assumptions', input.scenarioId));
  }

  // Network integrity.
  if (cs && cs.travelLinks) {
    for (i = 0; i < cs.travelLinks.length; i++) {
      var ln = cs.travelLinks[i];
      if (!stopIds[ln.fromStopId]) {
        issues.push(issue('Error', 'DanglingStopRef', 'Travel link ' + ln.id + ' references unknown fromStopId ' + ln.fromStopId + '.', 'TravelLink', ln.id));
      }
      if (!stopIds[ln.toStopId]) {
        issues.push(issue('Error', 'DanglingStopRef', 'Travel link ' + ln.id + ' references unknown toStopId ' + ln.toStopId + '.', 'TravelLink', ln.id));
      }
      if (ln.baselineTravelMinutes <= 0) {
        issues.push(issue('Error', 'InfeasibleTravelTime', 'Travel link ' + ln.id + ' has non-positive baselineTravelMinutes; a bus cannot move instantaneously.', 'TravelLink', ln.id));
      }
    }
  }
  if (cs && cs.routes) {
    for (i = 0; i < cs.routes.length; i++) {
      var rt = cs.routes[i];
      var seq = rt.stopSequence || [];
      for (j = 0; j < seq.length; j++) {
        if (!stopIds[seq[j]]) {
          issues.push(issue('Error', 'DanglingStopRef', 'Route ' + rt.id + ' references unknown stop ' + seq[j] + '.', 'Route', rt.id));
        }
      }
    }
  }
  if (cs && cs.coreTrips) {
    for (i = 0; i < cs.coreTrips.length; i++) {
      var tr = cs.coreTrips[i];
      if (!routeIds[tr.routeId]) {
        issues.push(issue('Warning', 'DanglingStopRef', 'Core trip ' + tr.id + ' references unknown routeId ' + tr.routeId + '.', 'CoreTrip', tr.id));
      }
      var sts = tr.stopTimes || [];
      if (sts.length < 2) {
        issues.push(issue('Error', 'TimeOrdering', 'Core trip ' + tr.id + ' needs at least two stop times.', 'CoreTrip', tr.id));
      }
      for (j = 0; j < sts.length; j++) {
        if (!stopIds[sts[j].stopId]) {
          issues.push(issue('Error', 'DanglingStopRef', 'Core trip ' + tr.id + ' references unknown stop ' + sts[j].stopId + '.', 'CoreTrip', tr.id));
        }
        if (msOf(sts[j].departureTime) < msOf(sts[j].arrivalTime)) {
          issues.push(issue('Error', 'TimeOrdering', 'Core trip ' + tr.id + ' departs stop ' + sts[j].stopId + ' before it arrives.', 'CoreTrip', tr.id));
        }
        if (j > 0 && msOf(sts[j].arrivalTime) < msOf(sts[j - 1].departureTime)) {
          issues.push(issue('Error', 'TimeOrdering', 'Core trip ' + tr.id + ' arrives at stop ' + sts[j].stopId + ' before leaving the previous stop.', 'CoreTrip', tr.id));
        }
      }
    }
  }

  // Currency must be stated once and consistently; mixing silently would make the cost curve meaningless.
  var currency = input.costConfig ? input.costConfig.currency : null;
  if (!currency) {
    issues.push(issue('Error', 'CurrencyMismatch', 'SimCostConfig.currency is required; costs must name their currency explicitly.', 'CostConfig', input.scenarioId));
  }
  if (input.extraBuses) {
    for (i = 0; i < input.extraBuses.length; i++) {
      var bus = input.extraBuses[i];
      if (bus.currency && currency && bus.currency !== currency) {
        issues.push(issue('Error', 'CurrencyMismatch', 'Extra bus ' + bus.id + ' is priced in ' + bus.currency + ' but the scenario currency is ' + currency + '.', 'ExtraBus', bus.id));
      }
      if (!stopIds[bus.startStopId]) {
        issues.push(issue('Error', 'DanglingStopRef', 'Extra bus ' + bus.id + ' starts at unknown stop ' + bus.startStopId + '.', 'ExtraBus', bus.id));
      }
      if (msOf(bus.availableTo) <= msOf(bus.availableFrom)) {
        issues.push(issue('Error', 'TimeOrdering', 'Extra bus ' + bus.id + ' has availableTo at or before availableFrom.', 'ExtraBus', bus.id));
      }
      if (bus.capacity <= 0) {
        issues.push(issue('Error', 'InfeasibleCapacity', 'Extra bus ' + bus.id + ' has non-positive capacity.', 'ExtraBus', bus.id));
      }
    }
  }

  // Events.
  var events = input.events || [];
  var eventIds = {};
  for (i = 0; i < events.length; i++) { eventIds[events[i].id] = true; }
  for (i = 0; i < events.length; i++) {
    var ev = events[i];
    if (msOf(ev.endTime) < msOf(ev.startTime)) {
      issues.push(issue('Error', 'TimeOrdering', 'Event ' + ev.id + ' ends before it starts.', 'Event', ev.id));
    }
    if (msOf(ev.knownAt) > msOf(ev.startTime)) {
      issues.push(issue('Info', 'KnownAtAfterStart', 'Event ' + ev.id + ' became known after it started; it is realized but withheld from the planner.', 'Event', ev.id));
    }
    if (ev.canonicalEventId && !eventIds[ev.canonicalEventId]) {
      issues.push(issue('Warning', 'DanglingEventRef', 'Event ' + ev.id + ' points at unknown canonicalEventId ' + ev.canonicalEventId + '; it is suppressed but its canonical target is missing.', 'Event', ev.id));
    }
    var affected = ev.affectedStopIds || [];
    for (j = 0; j < affected.length; j++) {
      if (!stopIds[affected[j]]) {
        issues.push(issue('Error', 'DanglingStopRef', 'Event ' + ev.id + ' affects unknown stop ' + affected[j] + '.', 'Event', ev.id));
      }
    }
    var affectedLinks = ev.affectedLinkIds || [];
    for (j = 0; j < affectedLinks.length; j++) {
      if (!linkIds[affectedLinks[j]]) {
        issues.push(issue('Error', 'DanglingStopRef', 'Event ' + ev.id + ' affects unknown travel link ' + affectedLinks[j] + '.', 'Event', ev.id));
      }
    }
    if (ev.confidence !== null && ev.confidence !== undefined && (ev.confidence < 0 || ev.confidence > 1)) {
      issues.push(issue('Error', 'ConfidenceOutOfRange', 'Event ' + ev.id + ' has confidence ' + ev.confidence + ' outside 0..1.', 'Event', ev.id));
    }
    issues = issues.concat(validateDemandEffect(ev, stopIds));
    issues = issues.concat(validateOperationalEffects(ev, stopIds, linkIds, busIds));
  }

  // Student-location estimates.
  var ests = input.studentLocationEstimates || [];
  for (i = 0; i < ests.length; i++) {
    var es = ests[i];
    if (es.estimateKind === 'UpdateToCohort' && !es.supersedesEstimateId) {
      issues.push(issue('Error', 'MissingSupersedesRef', 'Estimate ' + es.id + ' is an UpdateToCohort but names no supersedesEstimateId, so it cannot be applied without double-counting the cohort.', 'LocationEstimate', es.id));
    }
    if (es.predictedStudentCount < 0) {
      issues.push(issue('Error', 'NegativeDemand', 'Estimate ' + es.id + ' has a negative predictedStudentCount.', 'LocationEstimate', es.id));
    }
    if (es.originStopId && !stopIds[es.originStopId]) {
      issues.push(issue('Error', 'DanglingStopRef', 'Estimate ' + es.id + ' references unknown originStopId ' + es.originStopId + '.', 'LocationEstimate', es.id));
    }
    if (es.destinationStopId && !stopIds[es.destinationStopId]) {
      issues.push(issue('Error', 'DanglingStopRef', 'Estimate ' + es.id + ' references unknown destinationStopId ' + es.destinationStopId + '.', 'LocationEstimate', es.id));
    }
    if (es.arrivalWindowStart && es.arrivalWindowEnd && msOf(es.arrivalWindowEnd) < msOf(es.arrivalWindowStart)) {
      issues.push(issue('Error', 'TimeOrdering', 'Estimate ' + es.id + ' has an arrival window that ends before it starts.', 'LocationEstimate', es.id));
    }
  }

  // Reputation scores. Rescaling silently would quietly change every weighted demand figure.
  var scores = input.reputationScores || [];
  for (i = 0; i < scores.length; i++) {
    var sc = scores[i];
    if (sc.scoreScale && sc.scoreScale !== '0to1') {
      issues.push(issue('Error', 'ScoreScaleUnsupported', 'Reputation score ' + sc.id + ' declares scale ' + sc.scoreScale + '; only 0to1 is supported and scores are never rescaled implicitly.', 'ReputationScore', sc.id));
    }
    if (sc.reliability < 0 || sc.reliability > 1) {
      issues.push(issue('Error', 'ScoreScaleUnsupported', 'Reputation score ' + sc.id + ' has reliability ' + sc.reliability + ' outside 0..1.', 'ReputationScore', sc.id));
    }
  }

  var errorCount = 0;
  var warningCount = 0;
  for (i = 0; i < issues.length; i++) {
    if (issues[i].severity === 'Error') { errorCount++; }
    else if (issues[i].severity === 'Warning') { warningCount++; }
  }

  return SimValidationReport.make({
    isValid: errorCount === 0,
    issues: issues,
    errorCount: errorCount,
    warningCount: warningCount
  });
}

// ---- reconciliation ----

/**
 * Attaches reports to events, suppresses duplicates, resolves cohort overlap and computes the
 * reliability weight for every event, recording each decision so the result can be audited.
 */
function reconcile(events, estimates, reports, scores, assumptions, scenarioId) {
  var entries = [];
  var notes = [];
  var i, j;

  var eventById = {};
  for (i = 0; i < events.length; i++) { eventById[events[i].id] = events[i]; }

  var matchWindowMs = ((assumptions.reportMatchWindowMinutes === null || assumptions.reportMatchWindowMinutes === undefined)
    ? 45 : assumptions.reportMatchWindowMinutes) * 60000;

  // 1 and 2: canonical id first, stop-and-time fallback second, retain anything unmatched.
  var reportsByEvent = {};
  for (i = 0; i < reports.length; i++) {
    var rep = reports[i];
    var matchedId = rep.event ? rep.event.id : null;
    var kind = 'ReportMatchedByCanonicalId';
    var rationale = 'Report carried the canonical event id, so no heuristic matching was needed.';

    if (!matchedId) {
      matchedId = fallbackMatch(rep, events, matchWindowMs);
      kind = matchedId ? 'ReportMatchedByFallback' : 'ReportUnmatched';
      rationale = matchedId
        ? 'Matched on scenario, reported stop within the event affectedStopIds, and reported start within ' + (matchWindowMs / 60000) + ' minutes of the event start.'
        : 'No event matched by canonical id or by the stop-and-time fallback. The report is retained for review and generates no demand; promoting an unverified report into an event would invent passengers.';
    }

    entries.push(SimReconciliationEntry.make({
      entryKind: kind,
      targetEventId: matchedId,
      contributingReportIds: [rep.id],
      policy: 'CanonicalIdThenStopAndTimeFallback',
      rationale: rationale,
      confidenceUsed: rep.reportedConfidence
    }));

    if (matchedId) {
      if (!reportsByEvent[matchedId]) { reportsByEvent[matchedId] = []; }
      reportsByEvent[matchedId].push(rep.id);
    }
  }

  // 3: duplicate and superseded events contribute nothing. N reports of one event therefore
  // produce one event's worth of demand.
  for (i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.canonicalEventId) {
      entries.push(SimReconciliationEntry.make({
        entryKind: 'DuplicateEventSuppressed',
        targetEventId: ev.id,
        contributingReportIds: reportsByEvent[ev.id] || [],
        policy: 'PreferCanonicalEventId',
        rationale: 'Event ' + ev.id + ' is a duplicate of canonical event ' + ev.canonicalEventId
          + '. It is retained for the reconciliation trace but generates no demand and no operational effects, so the underlying event is counted exactly once.',
        appliedWeight: 0
      }));
    } else if (ev.supersededByEventId) {
      entries.push(SimReconciliationEntry.make({
        entryKind: 'EventSuperseded',
        targetEventId: ev.id,
        contributingReportIds: reportsByEvent[ev.id] || [],
        policy: 'PreferLatestEvent',
        rationale: 'Event ' + ev.id + ' was superseded by ' + ev.supersededByEventId + ' and contributes nothing.',
        appliedWeight: 0
      }));
    }
  }

  // Superseded location estimates.
  var supersededEstimates = {};
  for (i = 0; i < estimates.length; i++) {
    var sup = estimates[i].supersedesEstimateId;
    if (sup) {
      supersededEstimates[sup] = true;
      entries.push(SimReconciliationEntry.make({
        entryKind: 'EstimateSuperseded',
        supersededEstimateIds: [sup],
        cohortIds: [estimates[i].cohortId],
        policy: 'PreferLatestEstimate',
        rationale: 'Estimate ' + sup + ' is replaced by ' + estimates[i].id + ' for cohort ' + estimates[i].cohortId + '; only the replacement generates journeys.'
      }));
    }
  }

  // 4: cohort overlap between class demand and event demand.
  var overlapPolicy = assumptions.cohortOverlapPolicy || 'PreferEvent';
  var eventCohorts = {};
  for (i = 0; i < events.length; i++) {
    var e2 = events[i];
    if (e2.canonicalEventId || e2.supersededByEventId) { continue; }
    if (e2.demandEffect && e2.demandEffect.cohortId) { eventCohorts[e2.demandEffect.cohortId] = e2.id; }
  }
  for (i = 0; i < estimates.length; i++) {
    var est = estimates[i];
    if (supersededEstimates[est.id]) { continue; }
    var owningEventId = eventCohorts[est.cohortId];
    if (!owningEventId) { continue; }

    if (overlapPolicy === 'PreferEvent') {
      entries.push(SimReconciliationEntry.make({
        entryKind: 'CohortOverlapResolved',
        targetEventId: owningEventId,
        supersededEstimateIds: [est.id],
        cohortIds: [est.cohortId],
        policy: overlapPolicy,
        rationale: 'Cohort ' + est.cohortId + ' is described both by event ' + owningEventId
          + ' and by location estimate ' + est.id + '. Under PreferEvent the event generates the journeys and the estimate is suppressed, so the cohort appears exactly once.'
      }));
    } else {
      entries.push(SimReconciliationEntry.make({
        entryKind: 'CohortOverlapResolved',
        targetEventId: owningEventId,
        cohortIds: [est.cohortId],
        policy: overlapPolicy,
        rationale: 'Cohort ' + est.cohortId + ' is described both by event ' + owningEventId
          + ' and by location estimate ' + est.id + '. Under PreferLocationEstimate the estimate generates the journeys and the event demand effect is suppressed, so the cohort appears exactly once.',
        appliedWeight: 0
      }));
    }
  }

  // 5: reliability weighting. Low-confidence events are retained with a reduced weight.
  var policy = assumptions.reliabilityPolicy || 'ConfidenceTimesReputation';
  var defConf = (assumptions.defaultConfidence === null || assumptions.defaultConfidence === undefined) ? 0.7 : assumptions.defaultConfidence;
  var defRep = (assumptions.defaultReputation === null || assumptions.defaultReputation === undefined) ? 0.5 : assumptions.defaultReputation;
  var scoreIndex = indexScores(scores);

  for (i = 0; i < events.length; i++) {
    var ev2 = events[i];
    if (ev2.canonicalEventId || ev2.supersededByEventId) { continue; }
    if (!ev2.demandEffect) { continue; }

    var conf = (ev2.confidence === null || ev2.confidence === undefined) ? defConf : ev2.confidence;
    // Only scores that actually exist are combined. A missing score falls back to the neutral
    // default and must NOT drag down a score that is present, which is why the two are combined
    // by presence rather than by taking the minimum against the default.
    var userRep = lookupScore(scoreIndex, 'User', ev2.reportingUserId, null);
    var eventRep = lookupScore(scoreIndex, 'Event', ev2.id, null);
    var rep;
    var repSource;
    if (userRep !== null && eventRep !== null) {
      rep = Math.min(userRep, eventRep);
      repSource = 'the lower of reporter reputation ' + userRep + ' and event reputation ' + eventRep;
    } else if (userRep !== null) {
      rep = userRep;
      repSource = 'reporter reputation ' + userRep + ' (no event-level score exists)';
    } else if (eventRep !== null) {
      rep = eventRep;
      repSource = 'event reputation ' + eventRep + ' (no reporter score exists)';
    } else {
      rep = defRep;
      repSource = 'the neutral default ' + defRep + ' (neither a reporter nor an event score exists)';
    }
    var weight;
    var rationaleText;

    if (ev2.eventSource === 'Scheduled') {
      weight = 1.0;
      rationaleText = 'Scheduled events are exempt from reliability discounting: a timetabled class is not an unverified report.';
    } else if (policy === 'None') {
      weight = 1.0;
      rationaleText = 'Reliability policy None: demand is taken at face value.';
    } else if (policy === 'ConfidenceOnly') {
      weight = conf;
      rationaleText = 'Reliability policy ConfidenceOnly: weight is the reported confidence.';
    } else if (policy === 'ReputationOnly') {
      weight = rep;
      rationaleText = 'Reliability policy ReputationOnly: weight is ' + repSource + '.';
    } else {
      weight = conf * rep;
      rationaleText = 'Reliability policy ConfidenceTimesReputation: weight is reported confidence '
        + conf + ' times ' + repSource + '.';
    }

    entries.push(SimReconciliationEntry.make({
      entryKind: 'ReliabilityWeightApplied',
      targetEventId: ev2.id,
      contributingReportIds: reportsByEvent[ev2.id] || [],
      policy: policy,
      rationale: rationaleText + ' The weight scales expected ridership only; it is a configurable heuristic weight, not a calibrated probability.',
      confidenceUsed: conf,
      reputationUsed: rep,
      appliedWeight: weight
    }));
  }

  notes.push('Reliability weight scales expected ridership only. It is a configurable heuristic weight and is NOT a calibrated probability of the event happening.');
  notes.push('Low-confidence events are retained with a reduced weight, never dropped, so the interface can show what was down-weighted and why.');
  notes.push('Confidence and reputation are kept separate from demand magnitude: attendance says how many, weight says how much to trust it.');
  notes.push('Duplicate suppression prefers the canonical event id. Events marked as duplicates stay in the exported event collection but generate neither demand nor operational effects.');
  notes.push('Cohort overlap policy in force: ' + overlapPolicy + '. A cohort named by both an event demand effect and a location estimate is generated once, by the preferred side.');
  notes.push('Missing confidence defaults to ' + defConf + ' and missing reputation to ' + defRep + ' (neutral, not zero).');

  return SimReconciliationTrace.make({
    entries: entries,
    reliabilityPolicy: policy,
    cohortOverlapPolicy: overlapPolicy,
    policyNotes: notes
  });
}

// ---- local helpers ----

function fallbackMatch(rep, events, matchWindowMs) {
  if (!rep.reportedStopId) { return null; }
  var repStart = msOf(rep.reportedStartTime);
  var best = null;
  var bestDelta = null;
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.scenarioId !== rep.scenarioId) { continue; }
    if (ev.canonicalEventId || ev.supersededByEventId) { continue; }
    var affected = ev.affectedStopIds || [];
    var hit = false;
    for (var j = 0; j < affected.length; j++) { if (affected[j] === rep.reportedStopId) { hit = true; break; } }
    if (!hit) { continue; }
    if (repStart === null) { return ev.id; }
    var delta = Math.abs(msOf(ev.startTime) - repStart);
    if (delta > matchWindowMs) { continue; }
    if (bestDelta === null || delta < bestDelta || (delta === bestDelta && ev.id < best)) {
      best = ev.id;
      bestDelta = delta;
    }
  }
  return best;
}

function indexScores(scores) {
  var idx = {};
  for (var i = 0; i < scores.length; i++) {
    var s = scores[i];
    var key = s.subjectKind + '|' + s.subjectId;
    var prev = idx[key];
    if (!prev || msOf(s.observedAt) >= msOf(prev.observedAt)) { idx[key] = s; }
  }
  return idx;
}

function lookupScore(idx, kind, subjectId, fallback) {
  if (!subjectId) { return fallback; }
  var s = idx[kind + '|' + subjectId];
  if (!s || s.reliability === null || s.reliability === undefined) { return fallback; }
  return s.reliability;
}

function validateDemandEffect(ev, stopIds) {
  var out = [];
  var de = ev.demandEffect;
  if (!de) { return out; }
  if (de.attendance !== null && de.attendance !== undefined && de.attendance < 0) {
    out.push(issue('Error', 'NegativeDemand', 'Event ' + ev.id + ' has negative attendance.', 'Event', ev.id));
  }
  if (de.busUseShare !== null && de.busUseShare !== undefined && (de.busUseShare < 0 || de.busUseShare > 1)) {
    out.push(issue('Error', 'ShareOutOfRange', 'Event ' + ev.id + ' has busUseShare ' + de.busUseShare + ' outside 0..1.', 'Event', ev.id));
  }
  out = out.concat(checkDistribution(ev, de.originDistribution, 'originDistribution', stopIds));
  out = out.concat(checkDistribution(ev, de.destinationDistribution, 'destinationDistribution', stopIds));
  if (de.generatesInbound === true && de.inboundWindowEndOffsetMin !== null && de.inboundWindowStartOffsetMin !== null
    && de.inboundWindowEndOffsetMin < de.inboundWindowStartOffsetMin) {
    out.push(issue('Error', 'TimeOrdering', 'Event ' + ev.id + ' has an inbound arrival window that ends before it starts.', 'Event', ev.id));
  }
  if (de.generatesOutbound === true && de.outboundWindowEndOffsetMin !== null && de.outboundWindowStartOffsetMin !== null
    && de.outboundWindowEndOffsetMin < de.outboundWindowStartOffsetMin) {
    out.push(issue('Error', 'TimeOrdering', 'Event ' + ev.id + ' has an outbound departure window that ends before it starts.', 'Event', ev.id));
  }
  return out;
}

function checkDistribution(ev, dist, label, stopIds) {
  var out = [];
  if (!dist || dist.length === 0) { return out; }
  var total = 0;
  for (var i = 0; i < dist.length; i++) {
    total += dist[i].share;
    if (!stopIds[dist[i].stopId]) {
      out.push(issue('Error', 'DanglingStopRef', 'Event ' + ev.id + ' ' + label + ' references unknown stop ' + dist[i].stopId + '.', 'Event', ev.id));
    }
    if (dist[i].share < 0 || dist[i].share > 1) {
      out.push(issue('Error', 'ShareOutOfRange', 'Event ' + ev.id + ' ' + label + ' has share ' + dist[i].share + ' outside 0..1.', 'Event', ev.id));
    }
  }
  if (Math.abs(total - 1.0) > 0.01) {
    out.push(issue('Warning', 'DistributionShareSum', 'Event ' + ev.id + ' ' + label + ' shares sum to ' + round2(total) + ' rather than 1.0; the generator renormalizes, which changes the split.', 'Event', ev.id));
  }
  return out;
}

function validateOperationalEffects(ev, stopIds, linkIds, busIds) {
  var out = [];
  var effects = ev.operationalEffects || [];
  for (var i = 0; i < effects.length; i++) {
    var ef = effects[i];
    var ws = ef.windowStart ? msOf(ef.windowStart) : msOf(ev.startTime);
    var we = ef.windowEnd ? msOf(ef.windowEnd) : msOf(ev.endTime);
    if (we <= ws) {
      out.push(issue('Error', 'TimeOrdering', 'Event ' + ev.id + ' operational effect ' + ef.effectKind + ' has an empty or reversed window.', 'Event', ev.id));
    }
    if (ef.effectKind === 'TravelTimeMultiplier') {
      if (!ef.linkIds || ef.linkIds.length === 0) {
        out.push(issue('Error', 'MissingEffectTarget', 'Event ' + ev.id + ' has a TravelTimeMultiplier effect with no linkIds.', 'Event', ev.id));
      }
      if (ef.travelTimeMultiplier === null || ef.travelTimeMultiplier === undefined || ef.travelTimeMultiplier < 1.0) {
        out.push(issue('Warning', 'MultiplierBelowOne', 'Event ' + ev.id + ' has travelTimeMultiplier ' + ef.travelTimeMultiplier + '; values below 1.0 model a speed-up, which the mock scenarios do not intend.', 'Event', ev.id));
      }
      for (var l = 0; l < (ef.linkIds || []).length; l++) {
        if (!linkIds[ef.linkIds[l]]) {
          out.push(issue('Error', 'DanglingStopRef', 'Event ' + ev.id + ' multiplies unknown travel link ' + ef.linkIds[l] + '.', 'Event', ev.id));
        }
      }
    } else if (ef.effectKind === 'StopUnavailable') {
      if (!ef.stopIds || ef.stopIds.length === 0) {
        out.push(issue('Error', 'MissingEffectTarget', 'Event ' + ev.id + ' has a StopUnavailable effect with no stopIds.', 'Event', ev.id));
      }
      for (var s = 0; s < (ef.stopIds || []).length; s++) {
        if (!stopIds[ef.stopIds[s]]) {
          out.push(issue('Error', 'DanglingStopRef', 'Event ' + ev.id + ' closes unknown stop ' + ef.stopIds[s] + '.', 'Event', ev.id));
        }
      }
      if (ef.fallbackStopId && !stopIds[ef.fallbackStopId]) {
        out.push(issue('Error', 'DanglingStopRef', 'Event ' + ev.id + ' names unknown fallbackStopId ' + ef.fallbackStopId + '.', 'Event', ev.id));
      }
      if (!ef.fallbackStopId) {
        out.push(issue('Info', 'ClosureWithoutFallback', 'Event ' + ev.id + ' closes a stop with no configured fallback. Affected passengers are reported unserved rather than silently relocated.', 'Event', ev.id));
      }
    } else if (ef.effectKind === 'BusUnavailable') {
      if (!ef.busIds || ef.busIds.length === 0) {
        out.push(issue('Error', 'MissingEffectTarget', 'Event ' + ev.id + ' has a BusUnavailable effect with no busIds.', 'Event', ev.id));
      }
      for (var b = 0; b < (ef.busIds || []).length; b++) {
        if (!busIds[ef.busIds[b]]) {
          out.push(issue('Warning', 'DanglingBusRef', 'Event ' + ev.id + ' withdraws unknown bus ' + ef.busIds[b] + '; core trips are never withdrawn by this effect.', 'Event', ev.id));
        }
      }
    }
  }
  return out;
}

function issue(severity, code, message, refKind, refId) {
  return SimValidationIssue.make({
    severity: severity, code: code, message: message, refKind: refKind, refId: refId
  });
}

function defaultAssumptions() {
  return SimAssumptions.make({
    defaultDwellMinutes: 0.5,
    boardingSecondsPerPassenger: 3,
    alightingSecondsPerPassenger: 2,
    reliabilityPolicy: 'ConfidenceTimesReputation',
    defaultConfidence: 0.7,
    defaultReputation: 0.5,
    maxTravelTimeMultiplier: 3.0,
    overlappingMultiplierRule: 'Multiply',
    cohortOverlapPolicy: 'PreferEvent',
    reportMatchWindowMinutes: 45,
    allowTransfers: false,
    queueDiscipline: 'FifoByRequestTime',
    arrivalWindowDistribution: 'UniformDeterministic',
    stopDelayWindowMinutes: 15,
    deadheadSpeedKmPerHour: 22,
    minTurnaroundMinutes: 4
  });
}

function defaultCostConfig() {
  return SimCostConfig.make({
    currency: 'USD',
    includeIdleAllocatedBuses: true,
    fixedCostPerAllocatedBus: 180,
    costPerOperatingMinute: 2.4,
    costPerDeadheadMinute: 2.4,
    costPerDwellMinute: 1.2
  });
}

function round2(v) { return Math.round(v * 100) / 100; }

function msOf(dt) {
  if (dt === null || dt === undefined) { return null; }
  if (typeof dt === 'number') { return dt; }
  return dt.toDate().getTime();
}
