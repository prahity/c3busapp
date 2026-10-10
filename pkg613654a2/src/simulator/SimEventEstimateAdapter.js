function getEventEstimates(scenarioId) {
  var res = SimEventEstimate.fetch({
    filter: Filter.eq('scenarioId', scenarioId),
    include: 'this',
    order: 'knownAt, id',
    limit: -1
  });
  return res.objs;
}

function adapterInfo() {
  return {
    adapter: 'SimEventEstimateAdapter',
    contractVersion: '1.0.0',
    sourceKind: 'MockLlmEventEstimator',
    reads: 'SimEventEstimate rows authored under pkg613654a2/data/SimEventEstimate',
    liveCalls: 'none - the LLM estimator is mocked, no prompts are issued and no credentials are read',
    requiredFields: ['scenarioId', 'knownAt'],
    optionalFields: [
      'canonicalEventId', 'eventName', 'locationStopId', 'startTime', 'endTime', 'estimatedAttendance',
      'expectedInboundPeakTime', 'expectedOutboundPeakTime', 'destinationDistribution', 'confidence',
      'producer', 'observedAt', 'forecastAt'
    ],
    role: [
      'An estimate is evidence ABOUT an event, never an event itself.',
      'Estimates cannot inject passengers. Demand comes only from SimEvent.demandEffect, so an estimate and the event it describes can never both generate the same riders.',
      'Set canonicalEventId whenever it is known; that is what lets assembly attach the estimate to the right event instead of guessing.'
    ],
    units: { estimatedAttendance: 'people at the event, before bus-use share is applied', confidence: 'unitless 0..1' },
    replaceWith: 'Reimplement getEventEstimates against the real estimator; attach canonicalEventId so no fallback matching is needed.',
    syntheticDataLabel: 'SIMULATED - synthetic event estimates'
  };
}
