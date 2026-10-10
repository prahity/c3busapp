function resolve(events, assumptions, planningCutoff, plannerVisibleOnly) {
  var rule = assumptions.overlappingMultiplierRule || 'Multiply';
  var maxMult = (assumptions.maxTravelTimeMultiplier === null || assumptions.maxTravelTimeMultiplier === undefined)
    ? 3.0 : assumptions.maxTravelTimeMultiplier;
  var cutoffMs = ms(planningCutoff);

  // One raw record per (effect, target). Suppressed events contribute nothing, so a disruption
  // reported twice cannot be applied twice.
  var raw = [];
  var contributing = {};
  var scenarioId = null;
  var list = events || [];

  for (var i = 0; i < list.length; i++) {
    var ev = list[i];
    if (!ev) { continue; }
    if (scenarioId === null) { scenarioId = ev.scenarioId; }
    if (ev.canonicalEventId || ev.supersededByEventId) { continue; }
    var effects = ev.operationalEffects;
    if (!effects || effects.length === 0) { continue; }

    var visible = ms(ev.knownAt) <= cutoffMs;

    for (var j = 0; j < effects.length; j++) {
      var ef = effects[j];
      var startMs = ms(ef.windowStart !== null && ef.windowStart !== undefined ? ef.windowStart : ev.startTime);
      var endMs = ms(ef.windowEnd !== null && ef.windowEnd !== undefined ? ef.windowEnd : ev.endTime);
      if (startMs === null || endMs === null || endMs <= startMs) { continue; }

      var targetKind = ef.effectKind === 'TravelTimeMultiplier' ? 'Link'
        : (ef.effectKind === 'StopUnavailable' ? 'Stop' : 'Bus');
      var targets = targetKind === 'Link' ? ef.linkIds : (targetKind === 'Stop' ? ef.stopIds : ef.busIds);
      if (!targets || targets.length === 0) { continue; }

      for (var k = 0; k < targets.length; k++) {
        raw.push({
          targetKind: targetKind,
          targetId: targets[k],
          startMs: startMs,
          endMs: endMs,
          kind: ef.effectKind,
          multiplier: (ef.travelTimeMultiplier === null || ef.travelTimeMultiplier === undefined)
            ? 1.0 : ef.travelTimeMultiplier,
          fallbackStopId: visible ? (ef.fallbackStopId || null) : null,
          eventId: ev.id,
          visible: visible
        });
        contributing[ev.id] = true;
      }
    }
  }

  // Group by target, then sweep breakpoints so the output intervals are disjoint. Doing the
  // combination here rather than inside the simulation loop is what makes it order-independent.
  var byTarget = {};
  for (var r = 0; r < raw.length; r++) {
    var key = raw[r].targetKind + '|' + raw[r].targetId;
    if (!byTarget[key]) { byTarget[key] = []; }
    byTarget[key].push(raw[r]);
  }

  var linkIntervals = [];
  var stopIntervals = [];
  var busIntervals = [];
  var anyClamp = false;
  var keys = [];
  for (var kk in byTarget) { keys.push(kk); }
  keys.sort();

  for (var ki = 0; ki < keys.length; ki++) {
    var group = byTarget[keys[ki]];
    var points = {};
    for (var g = 0; g < group.length; g++) {
      points[group[g].startMs] = true;
      points[group[g].endMs] = true;
    }
    var bps = [];
    for (var p in points) { bps.push(Number(p)); }
    bps.sort(function (a, b) { return a - b; });

    for (var b = 0; b < bps.length - 1; b++) {
      var segStart = bps[b];
      var segEnd = bps[b + 1];
      var active = [];
      for (var a = 0; a < group.length; a++) {
        if (group[a].startMs <= segStart && group[a].endMs >= segEnd) { active.push(group[a]); }
      }
      if (active.length === 0) { continue; }

      var combined = combineActive(active, rule, maxMult);
      if (combined.clampApplied) { anyClamp = true; }

      var interval = SimEffectInterval.make({
        targetKind: active[0].targetKind,
        targetId: active[0].targetId,
        intervalStart: DateTime.fromMillis(segStart),
        intervalEnd: DateTime.fromMillis(segEnd),
        multiplier: combined.multiplier,
        isUnavailable: combined.isUnavailable,
        sourceEventIds: combined.sourceEventIds,
        combinationApplied: combined.combinationApplied,
        clampApplied: combined.clampApplied,
        fallbackStopId: combined.fallbackStopId,
        visibleToPlanner: combined.visible
      });

      if (active[0].targetKind === 'Link') { linkIntervals.push(interval); }
      else if (active[0].targetKind === 'Stop') { stopIntervals.push(interval); }
      else { busIntervals.push(interval); }
    }
  }

  var contributingIds = [];
  for (var c in contributing) { contributingIds.push(c); }
  contributingIds.sort();

  return SimResolvedEffects.make({
    scenarioId: scenarioId,
    plannerVisibleOnly: plannerVisibleOnly === true,
    linkIntervals: linkIntervals,
    stopIntervals: stopIntervals,
    busIntervals: busIntervals,
    combinationPolicy: rule + ' for overlapping travel-time multipliers, clamped at ' + maxMult
      + '; union for unavailability; unavailability dominates travel time',
    maxMultiplier: maxMult,
    clampApplied: anyClamp,
    contributingEventIds: contributingIds
  });
}

function multiplierAt(effects, linkId, at) {
  var atMs = ms(at);
  var ivs = effects.linkIntervals || [];
  for (var i = 0; i < ivs.length; i++) {
    var iv = ivs[i];
    if (iv.targetId === linkId && ms(iv.intervalStart) <= atMs && ms(iv.intervalEnd) > atMs) {
      return (iv.multiplier === null || iv.multiplier === undefined) ? 1.0 : iv.multiplier;
    }
  }
  return 1.0;
}

function isUnavailableAt(effects, targetKind, targetId, at) {
  var atMs = ms(at);
  var ivs = targetKind === 'Stop' ? (effects.stopIntervals || []) : (effects.busIntervals || []);
  for (var i = 0; i < ivs.length; i++) {
    var iv = ivs[i];
    if (iv.targetId === targetId && iv.isUnavailable === true
      && ms(iv.intervalStart) <= atMs && ms(iv.intervalEnd) > atMs) {
      return true;
    }
  }
  return false;
}

// ---- local helpers ----

/**
 * Combines every raw effect active over one elementary interval.
 *
 * Multipliers combine by the configured rule and are then clamped. Unavailability is a union, and
 * unavailability dominates: once a stop or bus is out of service, how fast traffic moves is moot.
 */
function combineActive(active, rule, maxMult) {
  var mult = 1.0;
  var sawMultiplier = false;
  var unavailable = false;
  var fallbackStopId = null;
  var visible = false;
  var ids = {};

  for (var i = 0; i < active.length; i++) {
    var a = active[i];
    ids[a.eventId] = true;
    if (a.visible) { visible = true; }
    if (a.kind === 'TravelTimeMultiplier') {
      sawMultiplier = true;
      if (rule === 'Max') {
        if (a.multiplier > mult) { mult = a.multiplier; }
      } else {
        mult = mult * a.multiplier;
      }
    } else {
      unavailable = true;
      if (!fallbackStopId && a.fallbackStopId) { fallbackStopId = a.fallbackStopId; }
    }
  }

  var clamped = false;
  if (sawMultiplier && mult > maxMult) {
    mult = maxMult;
    clamped = true;
  }

  var sourceEventIds = [];
  for (var k in ids) { sourceEventIds.push(k); }
  sourceEventIds.sort();

  var applied;
  if (unavailable && sawMultiplier) {
    applied = 'UnavailabilityDominatesTravelTime';
  } else if (unavailable) {
    applied = active.length > 1 ? 'UnionOfUnavailability' : 'Single';
  } else {
    applied = active.length > 1 ? rule : 'Single';
  }

  return {
    multiplier: sawMultiplier ? mult : 1.0,
    isUnavailable: unavailable,
    sourceEventIds: sourceEventIds,
    combinationApplied: applied,
    clampApplied: clamped,
    fallbackStopId: fallbackStopId,
    visible: visible
  };
}

/** Epoch millis for a C3 datetime, or null. Kept local so the engine never crosses a type boundary in a loop. */
function ms(dt) {
  if (dt === null || dt === undefined) { return null; }
  if (typeof dt === 'number') { return dt; }
  return dt.toDate().getTime();
}
