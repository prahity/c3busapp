/*
 * TransitPlanner — event-transit day planner engine. Pure over the json segment-table + demand
 * contract so the same code serves live data and fixed test networks. Written with explicit
 * intermediate variables (no compound property writes) to avoid the Rhino "Bad type on operand
 * stack" VerifyError.
 */

/* ------------------------------- settings ------------------------------- */

function _num(v, dflt) {
  return v !== undefined && v !== null && !isNaN(v) ? Number(v) : dflt;
}

/* Copy a (possibly C3-boxed json) list into a native JS array so sort/splice/concat work. */
function _list(x) {
  var out = [];
  if (!x) {
    return out;
  }
  var i;
  for (i = 0; i < x.length; i++) {
    out.push(x[i]);
  }
  return out;
}

function resolveSettings(overrides) {
  var cfg = null;
  try {
    cfg = PlannerConfig.getConfig();
  } catch (e) {
    cfg = null;
  }
  var o = overrides ? overrides : {};
  function pick(key, dflt) {
    if (o[key] !== undefined && o[key] !== null) {
      return o[key];
    }
    if (cfg && cfg[key] !== undefined && cfg[key] !== null) {
      return cfg[key];
    }
    return dflt;
  }
  return {
    weightTime: _num(pick('weightTime'), 1.0),
    weightBuffer: _num(pick('weightBuffer'), 0.5),
    weightCrowd: _num(pick('weightCrowd'), 2.0),
    transitShare: _num(pick('transitShare'), 0.6),
    maxWalkSeconds: _num(pick('maxWalkSeconds'), 900),
    maxTransfers: _num(pick('maxTransfers'), 2),
    minTransferSlackSeconds: _num(pick('minTransferSlackSeconds'), 120),
    minArrivalBufferSeconds: _num(pick('minArrivalBufferSeconds'), 300),
    standingTimeLimitSeconds: _num(pick('standingTimeLimitSeconds'), 1200),
    costPerBusHour: _num(pick('costPerBusHour'), 120.0),
    planningHorizonSeconds: _num(pick('planningHorizonSeconds'), 86400),
    timezone: pick('timezone', 'America/Chicago'),
  };
}

/* ------------------------------- helpers ------------------------------- */

function _pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function _secToClock(sec) {
  if (sec === null || sec === undefined) {
    return null;
  }
  var s = Math.round(sec);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s - h * 3600) / 60);
  var ss = s - h * 3600 - m * 60;
  return _pad2(h) + ':' + _pad2(m) + ':' + _pad2(ss);
}

/* Expand the segment table into a flat trip list; one entry per (segment, departure index). */
function _expandTrips(segmentTable) {
  var trips = [];
  if (!segmentTable) {
    return trips;
  }
  var starts = Object.keys(segmentTable);
  var i;
  var j;
  var k;
  for (i = 0; i < starts.length; i++) {
    var startStop = starts[i];
    var dests = segmentTable[startStop];
    var destKeys = Object.keys(dests);
    for (j = 0; j < destKeys.length; j++) {
      var destStop = destKeys[j];
      var segs = dests[destStop];
      for (k = 0; k < segs.length; k++) {
        var seg = segs[k];
        var deps = seg.departure_times || [];
        var arrs = seg.arrivals || [];
        var t;
        for (t = 0; t < deps.length && t < arrs.length; t++) {
          var arrPair = arrs[t];
          trips.push({
            startStop: startStop,
            destStop: destStop,
            route_id: seg.route_id,
            block_id: seg.block_id ? seg.block_id : null,
            dep: Number(deps[t]),
            arr: Number(arrPair[1]),
            segId: arrPair[0],
          });
        }
      }
    }
  }
  return trips;
}

/* Apply operational events (closures + travel-time increases) within their active windows. */
function _applyOperationalEvents(trips, opEvents) {
  if (!opEvents || opEvents.length === 0) {
    return trips;
  }
  var out = [];
  var i;
  var e;
  for (i = 0; i < trips.length; i++) {
    var trip = trips[i];
    var dropped = false;
    var extraTravel = 0;
    for (e = 0; e < opEvents.length; e++) {
      var ev = opEvents[e];
      var win = ev.window || [0, 0];
      var inWindow = trip.dep >= win[0] && trip.dep <= win[1];
      if (!inWindow) {
        continue;
      }
      var closedSegs = ev.closedSegments || [];
      var cs;
      for (cs = 0; cs < closedSegs.length; cs++) {
        if (closedSegs[cs] === trip.segId) {
          dropped = true;
        }
      }
      var closedRoutes = ev.closedRoutes || [];
      var cr;
      for (cr = 0; cr < closedRoutes.length; cr++) {
        if (closedRoutes[cr] === trip.route_id) {
          dropped = true;
        }
      }
      var closedStops = ev.closedStops || [];
      var cst;
      for (cst = 0; cst < closedStops.length; cst++) {
        if (closedStops[cst] === trip.startStop || closedStops[cst] === trip.destStop) {
          dropped = true;
        }
      }
      var affected = ev.affectedRoutes || [];
      var inc = _num(ev.travelTimeIncreaseSeconds, 0);
      if (inc > 0) {
        var af;
        for (af = 0; af < affected.length; af++) {
          if (affected[af] === trip.route_id) {
            extraTravel = extraTravel + inc;
          }
        }
      }
    }
    if (dropped) {
      continue;
    }
    if (extraTravel > 0) {
      out.push({
        startStop: trip.startStop,
        destStop: trip.destStop,
        route_id: trip.route_id,
        block_id: trip.block_id,
        dep: trip.dep,
        arr: trip.arr + extraTravel,
        segId: trip.segId,
      });
    } else {
      out.push(trip);
    }
  }
  return out;
}

/* Index trips by start stop, each sorted by departure time. */
function _indexByStart(trips) {
  var idx = {};
  var i;
  for (i = 0; i < trips.length; i++) {
    var trip = trips[i];
    var arr = idx[trip.startStop];
    if (arr === undefined) {
      arr = [];
      idx[trip.startStop] = arr;
    }
    arr.push(trip);
  }
  var keys = Object.keys(idx);
  var k;
  for (k = 0; k < keys.length; k++) {
    idx[keys[k]].sort(function (a, b) {
      return a.dep - b.dep;
    });
  }
  return idx;
}

/* Build walking adjacency from a {"from->to": seconds} map. */
function _walkAdjacency(walkTimes) {
  var adj = {};
  if (!walkTimes) {
    return adj;
  }
  var keys = Object.keys(walkTimes);
  var i;
  for (i = 0; i < keys.length; i++) {
    var parts = keys[i].split('->');
    if (parts.length !== 2) {
      continue;
    }
    var from = parts[0];
    var to = parts[1];
    var list = adj[from];
    if (list === undefined) {
      list = [];
      adj[from] = list;
    }
    list.push({ to: to, sec: Number(walkTimes[keys[i]]) });
  }
  return adj;
}

function _capacityFor(trip, capacities) {
  var def = capacities && capacities['default'] ? capacities['default'] : { seated: 36, total: 60 };
  if (capacities && capacities.byBlock && trip.block_id && capacities.byBlock[trip.block_id]) {
    return capacities.byBlock[trip.block_id];
  }
  if (capacities && capacities.byRoute && capacities.byRoute[trip.route_id]) {
    return capacities.byRoute[trip.route_id];
  }
  return def;
}

/* ------------------------------- candidate search ------------------------------- */

/*
 * Enumerate feasible journeys from `origin` (ready at `readySec`) to `destStop`, arriving by
 * `deadline`, respecting maxTransfers / maxWalk / minTransferSlack. Bounded DFS over the small event
 * sub-network; chaining segments builds transfers, consecutive same-block trips are not a transfer.
 */
function _findJourneys(ctx, origin, readySec, destStop, deadline) {
  var results = [];
  var visited = {};

  function explore(curStop, curTime, legs, numRides, lastRideBlock, lastWasRide, lastWasWalk) {
    if (curStop === destStop && numRides >= 1) {
      results.push(_materialize(legs, readySec, deadline));
      return;
    }
    if (results.length > 200) {
      return;
    }
    visited[curStop] = true;

    if (numRides < ctx.maxTransfers + 1) {
      var trips = ctx.tripsByStart[curStop] || [];
      var i;
      for (i = 0; i < trips.length; i++) {
        var trip = trips[i];
        var sameBlock = lastWasRide && lastRideBlock && trip.block_id && trip.block_id === lastRideBlock;
        var isTransfer = numRides >= 1 && !sameBlock;
        var required = curTime + (isTransfer ? ctx.minTransferSlackSeconds : 0);
        if (trip.dep < required) {
          continue;
        }
        if (trip.arr > deadline) {
          continue;
        }
        if (visited[trip.destStop] && trip.destStop !== destStop) {
          continue;
        }
        var rideLeg = {
          type: 'ride',
          route_id: trip.route_id,
          segId: trip.segId,
          block_id: trip.block_id,
          from: curStop,
          to: trip.destStop,
          board: trip.dep,
          alight: trip.arr,
          isTransfer: isTransfer,
          slackSec: isTransfer ? trip.dep - curTime : null,
        };
        var nextLegs = legs.concat([rideLeg]);
        explore(trip.destStop, trip.arr, nextLegs, numRides + 1, trip.block_id, true, false);
      }
    }

    if (!lastWasWalk) {
      var edges = ctx.walkAdj[curStop] || [];
      var w;
      for (w = 0; w < edges.length; w++) {
        var edge = edges[w];
        if (edge.sec > ctx.maxWalkSeconds) {
          continue;
        }
        if (visited[edge.to] && edge.to !== destStop) {
          continue;
        }
        var walkLeg = {
          type: 'walk',
          from: curStop,
          to: edge.to,
          start: curTime,
          end: curTime + edge.sec,
          walkSec: edge.sec,
        };
        var legs2 = legs.concat([walkLeg]);
        explore(edge.to, curTime + edge.sec, legs2, numRides, null, false, true);
      }
    }

    visited[curStop] = false;
  }

  explore(origin, readySec, [], 0, null, false, false);
  return results;
}

/* Compute journey metrics from its leg list. */
function _materialize(legs, readySec, deadline) {
  var first = legs[0];
  var firstStart = first.type === 'walk' ? first.start : first.board;
  var last = legs[legs.length - 1];
  var arrival = last.type === 'walk' ? last.end : last.alight;
  var transfers = 0;
  var minSlack = null;
  var rideLegs = [];
  var walkTotal = 0;
  var i;
  for (i = 0; i < legs.length; i++) {
    var leg = legs[i];
    if (leg.type === 'ride') {
      rideLegs.push(leg);
      if (leg.isTransfer) {
        transfers = transfers + 1;
        if (minSlack === null || leg.slackSec < minSlack) {
          minSlack = leg.slackSec;
        }
      }
    } else {
      walkTotal = walkTotal + leg.walkSec;
    }
  }
  return {
    legs: legs,
    rideLegs: rideLegs,
    firstStart: firstStart,
    arrival: arrival,
    doorToDoorSec: arrival - firstStart,
    bufferSec: deadline - arrival,
    transfers: transfers,
    minSlackSec: minSlack,
    walkTotalSec: walkTotal,
  };
}

/* ------------------------------- scoring ------------------------------- */

function _crowdPenaltyNow(cand, occupancy, capacities) {
  var worst = 0;
  var i;
  for (i = 0; i < cand.rideLegs.length; i++) {
    var leg = cand.rideLegs[i];
    var occ = occupancy[leg.segId];
    if (occ === undefined) {
      occ = 0;
    }
    var cap = _capacityFor(leg, capacities);
    var seated = cap.seated > 0 ? cap.seated : 1;
    var ratio = occ / seated;
    if (ratio > worst) {
      worst = ratio;
    }
  }
  return worst;
}

function _score(cand, settings, occupancy, capacities) {
  var ttdMin = cand.doorToDoorSec / 60;
  var bufMin = cand.bufferSec / 60;
  var crowd = _crowdPenaltyNow(cand, occupancy, capacities);
  return settings.weightTime * ttdMin - settings.weightBuffer * bufMin + settings.weightCrowd * crowd;
}

function _crowdLabel(ratioSeated, ratioTotal) {
  if (ratioSeated <= 1.0) {
    return 'comfortable';
  }
  if (ratioTotal < 1.0) {
    return 'standing';
  }
  return 'full';
}

/* ------------------------------- assignment ------------------------------- */

/* Available seats on a ride leg given current occupancy and the standing-time rule. */
function _legAvailable(leg, occupancy, capacities, standingLimit) {
  var occ = occupancy[leg.segId];
  if (occ === undefined) {
    occ = 0;
  }
  var cap = _capacityFor(leg, capacities);
  var dur = leg.alight - leg.board;
  var ceiling = dur < standingLimit ? cap.total : cap.seated;
  var avail = ceiling - occ;
  return avail > 0 ? avail : 0;
}

/* ------------------------------- usage example ------------------------------- */

/*
 * One representative service day assembled inline (what the adapters would normally produce), run
 * through planDay. Demonstrates a transfer, a same-block continuation, an operational delay,
 * capacity overflow handled by an extra bus, and a return ("from") trip — producing both views.
 */
function exampleServiceDay() {
  var plan = {
    segmentTable: {
      LOT_A: {
        HUB: [
          { route_id: 'R1', block_id: 'B1_am', departure_times: [30600], arrivals: [['r1am|LOT_A|HUB', 30900]] },
          { route_id: 'R1', block_id: 'B1_pm', departure_times: [66600], arrivals: [['r1pm1|LOT_A|HUB', 66900]] },
        ],
      },
      HUB: {
        QUAD: [{ route_id: 'R3', block_id: 'B3', departure_times: [31050], arrivals: [['r3|HUB|QUAD', 31350]] }],
        VENUE: [{ route_id: 'R1', block_id: 'B1_pm', departure_times: [66900], arrivals: [['r1pm2|HUB|VENUE', 67500]] }],
      },
      LOT_B: {
        VENUE: [
          {
            route_id: 'R2',
            block_id: 'B2',
            departure_times: [66600, 67200],
            arrivals: [['r2a|LOT_B|VENUE', 67200], ['r2b|LOT_B|VENUE', 67800]],
          },
        ],
      },
      VENUE: {
        LOT_B: [
          {
            route_id: 'R2',
            block_id: 'B2r',
            departure_times: [77400, 78000],
            arrivals: [['r2ra|VENUE|LOT_B', 78000], ['r2rb|VENUE|LOT_B', 78600]],
          },
        ],
      },
    },
    demand: [
      // Morning class: park at LOT_A, ride to the HUB, transfer to the QUAD shuttle.
      { id: 'classAM', direction: 'to', origin: 'LOT_A', destination: 'QUAD', riders: 30, earliestDeparture: 30000, deadline: 31500 },
      // Evening game from LOT_A: one vehicle (same block) continues HUB -> VENUE, no transfer.
      { id: 'gameLotA', direction: 'to', origin: 'LOT_A', destination: 'VENUE', riders: 50, earliestDeparture: 66000, deadline: 68400 },
      // Evening game from LOT_B: direct, over capacity -> overflow handled by the extra bus.
      { id: 'gameLotB', direction: 'to', origin: 'LOT_B', destination: 'VENUE', riders: 150, earliestDeparture: 66000, deadline: 68400 },
      // Post-game return home to LOT_B (a "from" interval, no hard deadline).
      { id: 'returnB', direction: 'from', origin: 'VENUE', destination: 'LOT_B', riders: 40, earliestDeparture: 77400, deadline: 79200 },
    ],
    operationalEvents: [
      // Game-night congestion adds travel time on R2 during the inbound window.
      { window: [66000, 68400], travelTimeIncreaseSeconds: 120, affectedRoutes: ['R2'] },
    ],
    capacities: { default: { seated: 36, total: 60 } },
    backgroundRidership: { R2: 4 },
    extraBuses: [{ id: 'EX1', seated: 40, total: 50, startLocation: 'LOT_B', availableFrom: 66000, availableUntil: 70000 }],
  };
  return planDay(plan);
}

/* ------------------------------- main ------------------------------- */

function planDay(plan) {
  var p = plan ? plan : {};
  var settings = resolveSettings(p.settings);

  var trips0 = _expandTrips(p.segmentTable);
  var trips = _applyOperationalEvents(trips0, p.operationalEvents);
  var tripsByStart = _indexByStart(trips);
  var walkAdj = _walkAdjacency(p.walkTimes);
  var capacities = p.capacities || {};
  var background = p.backgroundRidership || {};

  var ctx = {
    tripsByStart: tripsByStart,
    walkAdj: walkAdj,
    maxTransfers: settings.maxTransfers,
    maxWalkSeconds: settings.maxWalkSeconds,
    minTransferSlackSeconds: settings.minTransferSlackSeconds,
  };

  // Occupancy per segment, seeded with background ridership for that route.
  var occupancy = {};
  var bi;
  for (bi = 0; bi < trips.length; bi++) {
    var tr = trips[bi];
    var bg = _num(background[tr.route_id], 0);
    occupancy[tr.segId] = bg;
  }

  // Process demand in time order (deadline, then earliest departure).
  var demand = _list(p.demand);
  demand.sort(function (a, b) {
    var da = _num(a.deadline, _num(a.earliestDeparture, 0));
    var db = _num(b.deadline, _num(b.earliestDeparture, 0));
    if (da !== db) {
      return da - db;
    }
    return _num(a.earliestDeparture, 0) - _num(b.earliestDeparture, 0);
  });

  var assignments = [];
  var unserved = [];
  var overflow = [];
  var di;
  for (di = 0; di < demand.length; di++) {
    var d = demand[di];
    var riders = Math.round(_num(d.riders, 0));
    if (riders <= 0) {
      continue;
    }
    var ready = _num(d.earliestDeparture, 0);
    var deadline = _num(d.deadline, ready + settings.planningHorizonSeconds);

    var cands = _findJourneys(ctx, d.origin, ready, d.destination, deadline);
    // Filter: feasible by deadline + transfer-slack rule.
    var feasible = [];
    var ci;
    for (ci = 0; ci < cands.length; ci++) {
      var cand = cands[ci];
      if (cand.bufferSec < 0) {
        continue;
      }
      if (cand.transfers > 0 && cand.minSlackSec !== null && cand.minSlackSec < settings.minTransferSlackSeconds) {
        continue;
      }
      feasible.push(cand);
    }

    var remaining = riders;
    var chosenForEntry = [];
    // Fill best-scoring route first; recompute scores as occupancy changes.
    var guard = 0;
    while (remaining > 0 && feasible.length > 0 && guard < 50) {
      guard = guard + 1;
      // pick best (lowest score)
      var bestIdx = -1;
      var bestScore = null;
      var fi;
      for (fi = 0; fi < feasible.length; fi++) {
        var sc = _score(feasible[fi], settings, occupancy, capacities);
        if (bestScore === null || sc < bestScore) {
          bestScore = sc;
          bestIdx = fi;
        }
      }
      var best = feasible[bestIdx];
      // binding capacity across ride legs
      var binding = -1;
      var li;
      for (li = 0; li < best.rideLegs.length; li++) {
        var avail = _legAvailable(best.rideLegs[li], occupancy, capacities, settings.standingTimeLimitSeconds);
        if (binding < 0 || avail < binding) {
          binding = avail;
        }
      }
      if (binding <= 0) {
        // this route is full; drop it and try the rest
        feasible.splice(bestIdx, 1);
        continue;
      }
      var put = remaining < binding ? remaining : binding;
      // apply load
      var lj;
      var worstSeated = 0;
      var worstTotal = 0;
      for (lj = 0; lj < best.rideLegs.length; lj++) {
        var legX = best.rideLegs[lj];
        var cur = occupancy[legX.segId];
        if (cur === undefined) {
          cur = 0;
        }
        var after = cur + put;
        occupancy[legX.segId] = after;
        var capX = _capacityFor(legX, capacities);
        var rS = after / (capX.seated > 0 ? capX.seated : 1);
        var rT = after / (capX.total > 0 ? capX.total : 1);
        if (rS > worstSeated) {
          worstSeated = rS;
        }
        if (rT > worstTotal) {
          worstTotal = rT;
        }
      }
      remaining = remaining - put;
      chosenForEntry.push({
        riders: put,
        legs: _legSummary(best.legs),
        segIds: _segIds(best.rideLegs),
        leaveBy: _secToClock(best.firstStart),
        leaveBySec: best.firstStart,
        arrival: _secToClock(best.arrival),
        arrivalSec: best.arrival,
        doorToDoorMin: Math.round((best.doorToDoorSec / 60) * 10) / 10,
        arrivalBufferMin: Math.round((best.bufferSec / 60) * 10) / 10,
        transfers: best.transfers,
        crowding: _crowdLabel(worstSeated, worstTotal),
        crowdRatioSeated: Math.round(worstSeated * 100) / 100,
      });
      // if route now full, remove it
      var stillRoom = false;
      var lk;
      for (lk = 0; lk < best.rideLegs.length; lk++) {
        if (_legAvailable(best.rideLegs[lk], occupancy, capacities, settings.standingTimeLimitSeconds) > 0) {
          stillRoom = true;
        }
      }
      if (!stillRoom) {
        feasible.splice(bestIdx, 1);
      }
    }

    if (chosenForEntry.length > 0) {
      assignments.push({
        intervalId: d.id,
        direction: d.direction || 'to',
        origin: d.origin,
        destination: d.destination,
        requested: riders,
        served: riders - remaining,
        options: chosenForEntry,
      });
    }
    if (remaining > 0) {
      var reason = cands.length === 0 ? 'no feasible route' : feasible.length === 0 ? 'capacity full' : 'capacity full';
      overflow.push({
        intervalId: d.id,
        direction: d.direction || 'to',
        origin: d.origin,
        destination: d.destination,
        riders: remaining,
        ready: ready,
        deadline: deadline,
        reason: reason,
      });
    }
  }

  // Supplemental buses for overflow.
  var supResult = _planSupplemental(overflow, p.extraBuses || [], trips, p.walkTimes || {}, settings);
  var supplemental = supResult.plans;
  var i2;
  for (i2 = 0; i2 < supResult.stillUnserved.length; i2++) {
    unserved.push(supResult.stillUnserved[i2]);
  }

  var riderView = _buildRiderView(assignments);
  var mtdView = _buildMtdView(trips, occupancy, capacities, supplemental, settings);

  return {
    riderView: riderView,
    mtdView: mtdView,
    unserved: unserved,
    assignments: assignments,
    supplemental: supplemental,
    diagnostics: {
      settings: settings,
      trips: trips.length,
      tripsAfterOps: trips.length,
      demandIntervals: demand.length,
      overflowIntervals: overflow.length,
    },
  };
}

function _segIds(rideLegs) {
  var out = [];
  var i;
  for (i = 0; i < rideLegs.length; i++) {
    out.push(rideLegs[i].segId);
  }
  return out;
}

function _legSummary(legs) {
  var out = [];
  var i;
  for (i = 0; i < legs.length; i++) {
    var leg = legs[i];
    if (leg.type === 'ride') {
      out.push({
        type: 'ride',
        route_id: leg.route_id,
        segId: leg.segId,
        from: leg.from,
        to: leg.to,
        board: _secToClock(leg.board),
        alight: _secToClock(leg.alight),
        isTransfer: leg.isTransfer,
      });
    } else {
      out.push({
        type: 'walk',
        from: leg.from,
        to: leg.to,
        walkMin: Math.round((leg.walkSec / 60) * 10) / 10,
      });
    }
  }
  return out;
}

/*
 * Plan supplemental buses: for each overflow interval (busiest first), pick an available extra bus
 * whose window covers the needed trip and whose start location can deadhead to the origin in time;
 * run a direct origin→destination trip timed to arrive by the deadline. A bus is reused across
 * intervals when its window still allows and it is free after its previous trip.
 */
function _planSupplemental(overflow, extraBuses, trips, walkTimes, settings) {
  var plans = [];
  var stillUnserved = [];
  // bus runtime state
  var busState = [];
  var i;
  for (i = 0; i < extraBuses.length; i++) {
    var b = extraBuses[i];
    busState.push({
      id: b.id,
      seated: _num(b.seated, 36),
      total: _num(b.total, 60),
      startLocation: b.startLocation,
      availableFrom: _num(b.availableFrom, 0),
      availableUntil: _num(b.availableUntil, settings.planningHorizonSeconds),
      freeAt: _num(b.availableFrom, 0),
      location: b.startLocation,
      busSeconds: 0,
    });
  }

  // busiest overflow first
  var work = overflow.slice(0);
  work.sort(function (a, b) {
    return b.riders - a.riders;
  });

  var oi;
  for (oi = 0; oi < work.length; oi++) {
    var ov = work[oi];
    var remaining = ov.riders;
    var travel = _odTravelSeconds(trips, ov.origin, ov.destination, walkTimes);
    if (travel === null) {
      stillUnserved.push({
        intervalId: ov.intervalId,
        origin: ov.origin,
        destination: ov.destination,
        riders: remaining,
        reason: 'no feasible route',
      });
      continue;
    }
    var guard = 0;
    while (remaining > 0 && guard < 100) {
      guard = guard + 1;
      // choose a bus able to serve: deadhead to origin, depart so arrival<=deadline
      var chosen = -1;
      var chosenDepart = null;
      var bj;
      for (bj = 0; bj < busState.length; bj++) {
        var bus = busState[bj];
        var deadhead = _odTravelSeconds(trips, bus.location, ov.origin, walkTimes);
        if (deadhead === null) {
          deadhead = _num(walkTimes[bus.location + '->' + ov.origin], 0);
        }
        var earliestDepart = bus.freeAt + deadhead;
        if (earliestDepart < ov.ready) {
          earliestDepart = ov.ready;
        }
        var arrival = earliestDepart + travel;
        if (arrival > ov.deadline) {
          continue;
        }
        if (earliestDepart < bus.availableFrom || arrival > bus.availableUntil) {
          continue;
        }
        if (chosen < 0 || earliestDepart < chosenDepart) {
          chosen = bj;
          chosenDepart = earliestDepart;
        }
      }
      if (chosen < 0) {
        break;
      }
      var busC = busState[chosen];
      var cap = busC.total;
      var put = remaining < cap ? remaining : cap;
      var depart = chosenDepart;
      var arr = depart + travel;
      var tripHours = (arr - busC.freeAt) / 3600;
      if (tripHours < travel / 3600) {
        tripHours = travel / 3600;
      }
      var newBusSeconds = busC.busSeconds + (arr - depart);
      busC.busSeconds = newBusSeconds;
      busC.freeAt = arr;
      busC.location = ov.destination;
      remaining = remaining - put;
      plans.push({
        busId: busC.id,
        intervalId: ov.intervalId,
        origin: ov.origin,
        destination: ov.destination,
        departure: _secToClock(depart),
        departureSec: depart,
        arrival: _secToClock(arr),
        arrivalSec: arr,
        ridersAssigned: put,
        busHours: Math.round(((arr - depart) / 3600) * 100) / 100,
        cost: Math.round(((arr - depart) / 3600) * settings.costPerBusHour * 100) / 100,
      });
    }
    if (remaining > 0) {
      stillUnserved.push({
        intervalId: ov.intervalId,
        origin: ov.origin,
        destination: ov.destination,
        riders: remaining,
        reason: 'no extra bus available',
      });
    }
  }
  return { plans: plans, stillUnserved: stillUnserved };
}

/* Estimate direct origin→destination travel seconds: median core-segment travel if any, else walk. */
function _odTravelSeconds(trips, origin, destination, walkTimes) {
  if (origin === destination) {
    return 0;
  }
  var samples = [];
  var i;
  for (i = 0; i < trips.length; i++) {
    var t = trips[i];
    if (t.startStop === origin && t.destStop === destination) {
      samples.push(t.arr - t.dep);
    }
  }
  if (samples.length > 0) {
    samples.sort(function (a, b) {
      return a - b;
    });
    return samples[Math.floor(samples.length / 2)];
  }
  var wk = walkTimes[origin + '->' + destination];
  if (wk !== undefined && wk !== null) {
    return Number(wk);
  }
  return null;
}

/* Rider view: for each origin→destination, the best (first) option as leave-by + crowding + backup. */
function _buildRiderView(assignments) {
  var out = [];
  var i;
  for (i = 0; i < assignments.length; i++) {
    var a = assignments[i];
    var best = a.options[0];
    var backup = a.options.length > 1 ? a.options[1] : null;
    out.push({
      intervalId: a.intervalId,
      direction: a.direction,
      origin: a.origin,
      destination: a.destination,
      leaveBy: best.leaveBy,
      arrival: best.arrival,
      doorToDoorMin: best.doorToDoorMin,
      arrivalBufferMin: best.arrivalBufferMin,
      transfers: best.transfers,
      crowding: best.crowding,
      legs: best.legs,
      backup: backup
        ? {
            leaveBy: backup.leaveBy,
            arrival: backup.arrival,
            doorToDoorMin: backup.doorToDoorMin,
            transfers: backup.transfers,
            crowding: backup.crowding,
          }
        : null,
    });
  }
  return out;
}

/* MTD view: crowding hotspots on core trips, supplemental cost summary, bus-hours added. */
function _buildMtdView(trips, occupancy, capacities, supplemental, settings) {
  var hotspots = [];
  var i;
  for (i = 0; i < trips.length; i++) {
    var trip = trips[i];
    var occ = occupancy[trip.segId];
    if (occ === undefined) {
      occ = 0;
    }
    var cap = _capacityFor(trip, capacities);
    if (occ > cap.seated) {
      hotspots.push({
        segId: trip.segId,
        route_id: trip.route_id,
        stop: trip.startStop,
        departure: _secToClock(trip.dep),
        windowStart: _secToClock(Math.floor(trip.dep / 900) * 900),
        occupancy: occ,
        seated: cap.seated,
        total: cap.total,
        level: occ > cap.total ? 'over-total' : 'standing',
      });
    }
  }
  hotspots.sort(function (a, b) {
    return b.occupancy - a.occupancy;
  });

  var totalBusHours = 0;
  var totalCost = 0;
  var s;
  for (s = 0; s < supplemental.length; s++) {
    totalBusHours = totalBusHours + supplemental[s].busHours;
    totalCost = totalCost + supplemental[s].cost;
  }

  return {
    crowdingHotspots: hotspots,
    supplementalBuses: supplemental,
    totalBusHoursAdded: Math.round(totalBusHours * 100) / 100,
    totalSupplementalCost: Math.round(totalCost * 100) / 100,
    costPerBusHour: settings.costPerBusHour,
  };
}
