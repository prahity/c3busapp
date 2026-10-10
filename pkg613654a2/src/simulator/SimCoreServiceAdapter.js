function getCoreService(scenarioId) {
  var f = Filter.eq('scenarioId', scenarioId);
  var stops = SimStop.fetch({ filter: f, include: 'this', order: 'id', limit: -1 }).objs;
  var routes = SimRouteDef.fetch({ filter: f, include: 'this', order: 'id', limit: -1 }).objs;
  var links = SimTravelLink.fetch({ filter: f, include: 'this', order: 'id', limit: -1 }).objs;
  var trips = SimCoreTrip.fetch({ filter: f, include: 'this', order: 'id', limit: -1 }).objs;

  return SimCoreServiceInput.make({
    stops: stops,
    routes: routes,
    travelLinks: links,
    coreTrips: trips
  });
}

function adapterInfo() {
  return {
    adapter: 'SimCoreServiceAdapter',
    contractVersion: '1.0.0',
    sourceKind: 'MockFixedCoreService',
    reads: 'SimStop, SimRouteDef, SimTravelLink and SimCoreTrip rows authored under pkg613654a2/data/',
    liveCalls: 'none',
    invariants: [
      'SimRouteDef.stopSequence is ordered; element 0 is the first stop served.',
      'SimTravelLink is directed: a link from A to B says nothing about B to A.',
      'SimCoreTrip.stopTimes is ordered and carries absolute arrival and departure timestamps.',
      'Core routes and timetables are FIXED. The planner never modifies them and they are identical in the baseline and in every candidate allocation, which is what makes the comparison meaningful.',
      'Core trips are immune to BusAvailabilityDisruption; only supplemental buses can be withdrawn.'
    ],
    realizedVersusTimetabled: 'Timetables are fixed, but a TrafficDisruption can delay a core trip in the realized run. A bus never departs a stop earlier than its timetabled departure; it can depart later.',
    units: { baselineTravelMinutes: 'minutes', distanceKm: 'kilometres' },
    replaceWith: 'A real integration would most likely read GTFS. Because everything is returned as one SimCoreServiceInput, that is a single-method change.',
    syntheticDataLabel: 'SIMULATED - synthetic network loosely inspired by the Illinois campus, not real MTD data'
  };
}
