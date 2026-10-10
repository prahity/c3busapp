function getScores(scenarioId) {
  var res = SimReputationScore.fetch({
    filter: Filter.eq('scenarioId', scenarioId),
    include: 'this',
    order: 'subjectKind, subjectId, observedAt',
    limit: -1
  });
  return res.objs;
}

function reliabilityFor(scenarioId, subjectKind, subjectId, defaultReputation) {
  var fallback = (defaultReputation === null || defaultReputation === undefined) ? 0.5 : defaultReputation;
  if (!subjectId) {
    return fallback;
  }
  var res = SimReputationScore.fetch({
    filter: Filter.eq('scenarioId', scenarioId)
      .and().eq('subjectKind', subjectKind)
      .and().eq('subjectId', subjectId),
    include: 'this',
    order: 'observedAt',
    limit: -1
  });
  var objs = res.objs;
  if (!objs || objs.length === 0) {
    return fallback;
  }
  var latest = objs[objs.length - 1];
  if (latest.reliability === null || latest.reliability === undefined) {
    return fallback;
  }
  return latest.reliability;
}

function adapterInfo() {
  return {
    adapter: 'SimReputationAdapter',
    contractVersion: '1.0.0',
    sourceKind: 'MockUserAndEventReputation',
    reads: 'SimReputationScore rows authored under pkg613654a2/data/SimReputationScore',
    liveCalls: 'none - reputation is supplied as data, not computed here',
    scale: {
      field: 'reliability',
      range: '0..1 inclusive, 1 meaning fully reliable',
      scoreScale: 'SimReputationScore.scoreScale must be the literal 0to1; assembly raises ScoreScaleUnsupported otherwise rather than silently rescaling'
    },
    missingScoreDefault: {
      value: 'SimAssumptions.defaultReputation, 0.5 in the mock scenarios',
      rationale: 'A subject with no history is treated as neutral, not as known-unreliable. Defaulting to zero would silently erase demand from every first-time reporter.'
    },
    multipleScores: 'When a subject has several scores the latest by observedAt wins; ties fall back to the supplied default.',
    notAProbability: 'Scores and the weights derived from them are configurable heuristic weights. They are not calibrated probabilities and must not be reported as such.',
    ownership: 'Computing reputation from real behaviour belongs to the reputation team. This simulator only consumes scores.',
    replaceWith: 'Reimplement getScores and reliabilityFor against the real reputation service, keeping the 0..1 scale and the neutral missing-score default.',
    syntheticDataLabel: 'SIMULATED - synthetic reputation for synthetic user handles'
  };
}
