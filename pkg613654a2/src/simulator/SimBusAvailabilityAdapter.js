function getExtraBuses(scenarioId) {
  var res = SimExtraBus.fetch({
    filter: Filter.eq('scenarioId', scenarioId),
    include: 'this',
    order: 'id',
    limit: -1
  });
  return res.objs;
}

function getAvailableBusCount(scenarioId) {
  return SimExtraBus.fetchCount({ filter: Filter.eq('scenarioId', scenarioId) });
}

function adapterInfo() {
  return {
    adapter: 'SimBusAvailabilityAdapter',
    contractVersion: '1.0.0',
    sourceKind: 'MockBusCountApi',
    reads: 'SimExtraBus rows authored under pkg613654a2/data/SimExtraBus',
    liveCalls: 'none - the real bus-count API has no agreed URL yet, so nothing is bound and no credentials are read',
    requiredFields: ['scenarioId', 'capacity', 'availableFrom', 'availableTo', 'startStopId'],
    optionalFields: [
      'fixedCostPerDay', 'costPerOperatingMinute', 'costPerDeadheadMinute', 'costPerDwellMinute', 'currency'
    ],
    units: { capacity: 'seats', 'cost fields': 'currency units, currency named explicitly per bus and on SimCostConfig' },
    disruptionHandling: 'Availability windows are returned exactly as authored. BusAvailabilityDisruption events are NOT folded in here; they are operational effects resolved by SimEffects.resolve, so a withdrawal that becomes known only after the planning cutoff cannot leak into the planner view.',
    decisionBoundary: 'How many extra buses to run is MTD\'s decision. This adapter only reports what could be available; the simulator evaluates every allocation from zero upward and presents the tradeoff. Nothing here dispatches a bus.',
    openQuestions: [
      'What "available" means operationally - spare vehicle, spare vehicle plus operator, or budgeted hours.',
      'Whether windows are per-vehicle or per-depot.',
      'Who owns the cost assumptions; the mock values are placeholders chosen to make the tradeoff visible, not MTD figures.'
    ],
    replaceWith: 'Reimplement getExtraBuses and getAvailableBusCount against the real API. getAvailableBusCount caps SimScenario.maxExtraBuses during assembly.',
    syntheticDataLabel: 'SIMULATED - synthetic bus pool with placeholder costs'
  };
}
