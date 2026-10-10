function getReports(scenarioId) {
  var res = SimEventReport.fetch({
    filter: Filter.eq('scenarioId', scenarioId),
    include: 'this, event.id',
    order: 'reportTime, id',
    limit: -1
  });
  return res.objs;
}

function adapterInfo() {
  return {
    adapter: 'SimEventReportAdapter',
    contractVersion: '1.0.0',
    sourceKind: 'MockAutoDetectionAndManualReports',
    reads: 'SimEventReport rows authored under pkg613654a2/data/SimEventReport',
    liveCalls: 'none - no detection service is contacted and no credentials are read',
    requiredFields: ['scenarioId', 'reportSource', 'reportTime'],
    optionalFields: [
      'event', 'reportedEventName', 'submittingUserId', 'reportedStopId', 'reportedStartTime',
      'reportedEndTime', 'reportedAttendance', 'reportedConfidence', 'rawPayload'
    ],
    deduplication: 'None here, deliberately. Raw reports are returned unreconciled, including several reports of one event, because the duplicate signal is exactly what reconciliation and reputation weighting need.',
    reconciliationOwnership: [
      'Reconciliation is owned by SimInputAssembler.assemble and nowhere else.',
      'Preferred path: the producer sets SimEventReport.event to the canonical SimEvent id.',
      'Fallback path, a mock heuristic to be retired once canonical ids arrive: same scenario, reportedStopId appearing in SimEvent.affectedStopIds, and reportedStartTime within SimAssumptions.reportMatchWindowMinutes of the event start.',
      'Unmatched reports are retained and traced as ReportUnmatched. They are never discarded and are never promoted into events, because promoting an unverified report would create demand out of nothing.'
    ],
    replaceWith: 'Reimplement getReports against the real detection and manual-report feeds. Keep reports distinguishable from reconciled events.',
    syntheticDataLabel: 'SIMULATED - synthetic reports from synthetic user handles'
  };
}
