function getEvents(scenarioId) {
  var res = SimEvent.fetch({
    filter: Filter.eq('scenarioId', scenarioId),
    include: 'this',
    order: 'startTime, id',
    limit: -1
  });
  return res.objs;
}

function getPlannerVisibleEvents(scenarioId, cutoff) {
  var res = SimEvent.fetch({
    filter: Filter.eq('scenarioId', scenarioId).and().le('knownAt', cutoff),
    include: 'this',
    order: 'startTime, id',
    limit: -1
  });
  var all = res.objs;
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (e.canonicalEventId || e.supersededByEventId) {
      continue;
    }
    out.push(e);
  }
  return out;
}

function upsertEvent(event) {
  return SimEvent.upsert(event);
}

function removeEvent(eventId) {
  var hit = SimEvent.fetch({ filter: Filter.eq('id', eventId), limit: 1 });
  if (hit.objs.length === 0) {
    return { removed: false, eventId: eventId, reason: 'NotFound' };
  }
  SimEvent.removeAll(Filter.eq('id', eventId));
  return { removed: true, eventId: eventId };
}

function adapterInfo() {
  return {
    adapter: 'SimEventFeedAdapter',
    contractVersion: '1.0.0',
    sourceKind: 'MockEditableEventFeed',
    reads: 'SimEvent rows authored under pkg613654a2/data/SimEvent and edited through the review interface',
    liveCalls: 'none - no LLM, no detection service, no credentials',
    producesCategories: [
      'ClassOrGathering', 'LargeEvent', 'TrafficDisruption', 'StopClosure', 'BusAvailabilityDisruption'
    ],
    extensibility: [
      'The engine never branches on SimEvent.eventType; it reads demandEffect and operationalEffects.',
      'A new category from the other agents only needs a mapping into those two effect shapes.',
      'eventType is retained for labelling, grouping and explanation text only.'
    ],
    replaceWith: 'Reimplement getEvents/getPlannerVisibleEvents against the real feed. Keep knownAt populated: the planning-cutoff split depends on it.',
    openQuestions: [
      'Whether the real feed supplies canonical event ids or expects this system to reconcile.',
      'Whether attendance and bus-use share arrive as point estimates or distributions.'
    ],
    syntheticDataLabel: 'SIMULATED - synthetic mock event feed'
  };
}
