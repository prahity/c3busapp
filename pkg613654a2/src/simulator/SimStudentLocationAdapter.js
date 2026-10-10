function getEstimates(scenarioId) {
  var res = SimStudentLocationEstimate.fetch({
    filter: Filter.eq('scenarioId', scenarioId),
    include: 'this',
    order: 'knownAt, id',
    limit: -1
  });
  return res.objs;
}

function adapterInfo() {
  return {
    adapter: 'SimStudentLocationAdapter',
    contractVersion: '1.0.0',
    sourceKind: 'MockLlmStudentLocationEstimator',
    reads: 'SimStudentLocationEstimate rows authored under pkg613654a2/data/SimStudentLocationEstimate',
    liveCalls: 'none - the LLM estimator is mocked, no prompts are issued and no credentials are read',
    requiredFields: ['scenarioId', 'cohortId', 'predictedStudentCount', 'estimateKind', 'knownAt'],
    optionalFields: [
      'originStopId', 'destinationStopId', 'arrivalWindowStart', 'arrivalWindowEnd',
      'classStartTime', 'confidence', 'supersedesEstimateId', 'linkedEventId', 'observedAt', 'producer'
    ],
    units: {
      predictedStudentCount: 'passengers',
      confidence: 'unitless 0..1 reliability, not a calibrated probability'
    },
    cohortSemantics: [
      'cohortId is a synthetic group label such as cohort_class_0900_engineering. It carries no personal data.',
      'An estimate with estimateKind UpdateToCohort must set supersedesEstimateId; assembly rejects it otherwise.',
      'When a cohortId also appears on a SimEvent demand effect, SimAssumptions.cohortOverlapPolicy decides which side generates the journeys so the cohort is never counted twice.'
    ],
    confidenceSemantics: 'confidence expresses how much to trust the estimate. It is kept separate from predictedStudentCount, which expresses how large the demand is.',
    replaceWith: 'Reimplement getEstimates against the real estimator. Return cohort-level counts only; this simulator must never receive individual-level location data.',
    syntheticDataLabel: 'SIMULATED - synthetic cohorts, no PII'
  };
}
