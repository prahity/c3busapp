function baselinePlan(input) {
  var coreTripIds = [];
  var cs = input.coreService;
  if (cs && cs.coreTrips) {
    for (var i = 0; i < cs.coreTrips.length; i++) { coreTripIds.push(cs.coreTrips[i].id); }
  }
  coreTripIds.sort();

  var visibleEventIds = [];
  var cutoffMs = msOf(input.planningCutoff);
  var events = input.events || [];
  for (var j = 0; j < events.length; j++) {
    var ev = events[j];
    if (ev.canonicalEventId || ev.supersededByEventId) { continue; }
    if (msOf(ev.knownAt) <= cutoffMs) { visibleEventIds.push(ev.id); }
  }
  visibleEventIds.sort();

  return SimPlan.make({
    planId: 'plan_' + input.scenarioId + '_baseline',
    planKind: 'MockOldModelBaseline',
    scenarioId: input.scenarioId,
    allocation: 0,
    extraBusItineraries: [],
    coreTripIds: coreTripIds,
    planningCutoff: input.planningCutoff,
    eventIdsVisibleToPlanner: visibleEventIds,
    explanations: [
      'MOCK OLD-MODEL BASELINE. No prior simulation model exists in this project, so this is a stand-in, '
        + 'not a reproduction of any historical MTD model. Its numbers must not be read as what a previous model would have said.',
      'Behaviour: run the fixed core MTD service against the same demand snapshot with ZERO extra buses.',
      'It is the "without changes" side of every comparison and the reference point for every saving figure.',
      'The zero-extra-bus candidate plan must produce identical results; SimComparison.comparabilityAssertions checks that on every run.'
    ],
    heuristicVersion: 'mock-old-model-baseline-1.0',
    validation: SimValidationReport.make({ isValid: true, issues: [], errorCount: 0, warningCount: 0 }),
    totalOperatingCost: 0,
    busesUsed: 0,
    busesIdle: 0
  });
}

function describe() {
  return {
    adapter: 'SimOldModelBaseline',
    contractVersion: '1.0.0',
    label: 'MOCK OLD-MODEL BASELINE',
    searchedForAnExistingModel: 'Yes. The project contains no prior bus-capacity simulation model to wrap, '
      + 'so a mock baseline is implemented instead and is labelled as such in every plan, result and export.',
    doesNotClaim: [
      'It does not reproduce a historical MTD model.',
      'It does not represent MTD current practice beyond the fixed core timetable supplied as scenario data.',
      'Its figures are not a measured "before"; they are a simulated "without changes".'
    ],
    behaviour: [
      'Runs the fixed core service from SimCoreServiceAdapter.',
      'Allocates zero extra buses, so totalOperatingCost is zero in the supplemental-cost basis used throughout.',
      'Experiences the SAME demand snapshot and the SAME realized events as every candidate, so differences come only from the extra buses.'
    ],
    replaceWith: 'Reimplement baselinePlan to emit the real old model\'s service plan. Nothing downstream changes: '
      + 'the engine, the metrics and the comparison all treat it as just another plan.',
    syntheticDataLabel: 'SIMULATED - mock baseline over synthetic core service'
  };
}

// ---- local helpers ----

function msOf(dt) {
  if (dt === null || dt === undefined) { return null; }
  if (typeof dt === 'number') { return dt; }
  return dt.toDate().getTime();
}
