/**
 * Backend access layer for the Surge Planner page.
 *
 * Every number this page renders comes from one of the six `SimRunner` actions
 * wrapped below. There is no client-side simulator and no fallback data: if a
 * call fails, the wrapper throws and the page shows the error.
 *
 * Two jobs live here:
 * 1. **Transport** — thin `c3Action` wrappers with a runtime shape guard, so a
 *    contract break surfaces as a readable error instead of crashing inside a
 *    component.
 * 2. **Adaptation** — small pure selectors that reshape the verified backend
 *    contract into what the components need (per-stop delay roll-ups, the
 *    heatmap's window axis, a stop-name registry, assertion parsing). None of
 *    them substitute a value for a null the backend returned.
 */

import { c3Action } from '@/c3Action';

import type {
  ParsedAssertion,
  SimComparison,
  SimPlan,
  SimResults,
  SimScenario,
  SimScopeDescriptor,
  SimStop,
  SimStopWindowDelay,
  StopId,
} from './contracts/types';

// ------------------------------------------------------------ normalization

/**
 * Names of fields the backend declares as C3 arrays (`[T]`).
 *
 * C3 serializes those as a JSON array in some runtimes and as a numerically
 * keyed object (`{"0": …, "1": …}`) in others, and an empty one as `{}`. Rather
 * than guessing which we got, every listed key is coerced to an array at the
 * boundary so component code can rely on `Array.prototype`.
 */
const ARRAY_FIELDS: ReadonlySet<string> = new Set([
  // SimComparison
  'candidates',
  'plans',
  'costCurve',
  'comparabilityAssertions',
  'heuristicNotes',
  'scopeNotes',
  // SimulationInput
  'events',
  'studentLocationEstimates',
  'eventEstimates',
  'eventReports',
  'reputationScores',
  'extraBuses',
  // SimCoreServiceInput
  'stops',
  'routes',
  'travelLinks',
  'coreTrips',
  'stopSequence',
  'stopTimes',
  'affectedStopIds',
  'operationalEffects',
  // reconciliation + validation
  'entries',
  'policyNotes',
  'contributingReportIds',
  'issues',
  // SimDemandSnapshot
  'journeys',
  'trace',
  'journeyIds',
  'realizedEventIds',
  'eventIdsUnknownAtCutoff',
  'suppressedEventIds',
  // SimPlan / itineraries
  'extraBusItineraries',
  'coreTripIds',
  'eventIdsVisibleToPlanner',
  'explanations',
  'trips',
  // SimResults
  'stopWindowDelays',
  'eventActivations',
  'infeasibilities',
  'affectedIds',
  'operationalEffectKinds',
  // SimScenario / scope
  'scenarioTags',
  'inScope',
  'outOfScope',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coerces a C3 collection into a real array, preserving numeric key order.
 * `null`/`undefined` become `[]` — an absent collection, not an invented one.
 */
export function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => value[k]);
  }
  return [];
}

/** Recursively coerces every {@link ARRAY_FIELDS} key in a backend response to an array. */
function normalizeArrays(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeArrays);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const child = value[key];
    out[key] = ARRAY_FIELDS.has(key) ? toList(child).map(normalizeArrays) : normalizeArrays(child);
  }
  return out;
}

/** Turns anything thrown by `c3Action` (which rejects with a bare string) into a readable message. */
export function describeError(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (isPlainObject(err) && typeof err.message === 'string') return err.message;
  return 'Unknown backend error.';
}

class ContractError extends Error {}

/**
 * Narrows a `SimRunner.runComparison` / `runAllocation` response to {@link SimComparison}.
 *
 * The invariants checked here are the ones the page cannot render without. A
 * violation throws so the failure appears in the UI next to the thing that
 * failed, rather than as `undefined` deep inside a chart.
 */
function asComparison(raw: unknown): SimComparison {
  const value = normalizeArrays(raw);
  if (!isPlainObject(value)) throw new ContractError('SimRunner returned no comparison object.');
  const problems: string[] = [];
  if (typeof value.scenarioId !== 'string') problems.push('scenarioId');
  if (!isPlainObject(value.input)) problems.push('input');
  if (!isPlainObject(value.baseline)) problems.push('baseline');
  if (!isPlainObject(value.demandSnapshot)) problems.push('demandSnapshot');
  if (!Array.isArray(value.candidates)) problems.push('candidates');
  if (!Array.isArray(value.plans)) problems.push('plans');
  if (!Array.isArray(value.costCurve)) problems.push('costCurve');
  if (problems.length > 0) {
    throw new ContractError(`SimComparison is missing or malformed: ${problems.join(', ')}.`);
  }
  return value as unknown as SimComparison;
}

function asScenarios(raw: unknown): SimScenario[] {
  const list = toList(normalizeArrays(raw));
  const scenarios: SimScenario[] = [];
  for (const entry of list) {
    if (!isPlainObject(entry) || typeof entry.id !== 'string') {
      throw new ContractError('SimRunner.listScenarios returned an entry with no id.');
    }
    scenarios.push(entry as unknown as SimScenario);
  }
  if (scenarios.length === 0) {
    throw new ContractError('SimRunner.listScenarios returned no scenarios. Has the scenario data been loaded?');
  }
  return scenarios.sort((a, b) => a.name.localeCompare(b.name));
}

function asScope(raw: unknown): SimScopeDescriptor {
  const value = normalizeArrays(raw);
  if (!isPlainObject(value) || typeof value.syntheticDataLabel !== 'string') {
    throw new ContractError('SimRunner.describeScope returned no syntheticDataLabel.');
  }
  return value as unknown as SimScopeDescriptor;
}

// ------------------------------------------------------------------ actions

/** `SimRunner.listScenarios()` — the scenario picker's only source. */
export async function fetchScenarios(): Promise<SimScenario[]> {
  return asScenarios(await c3Action('SimRunner', 'listScenarios', []));
}

/** `SimRunner.describeScope()` — scope, data labelling and the synthetic-data banner text. */
export async function fetchScope(): Promise<SimScopeDescriptor> {
  return asScope(await c3Action('SimRunner', 'describeScope', []));
}

/**
 * `SimRunner.runComparison(scenarioId, maxExtraBuses)` — the full sweep.
 *
 * Returns the baseline plus one candidate for every allocation from 0 to
 * `maxExtraBuses`, and a cost curve covering all of them, so the allocation
 * control can move without another round trip.
 */
export async function runComparison(scenarioId: string, maxExtraBuses: number): Promise<SimComparison> {
  return asComparison(await c3Action('SimRunner', 'runComparison', [scenarioId, maxExtraBuses]));
}

/**
 * `SimRunner.runAllocation(scenarioId, allocation)` — the cheap single-allocation path.
 *
 * Used to re-simulate just the selected allocation. The response carries the
 * baseline and one candidate only, so it is merged into the loaded sweep rather
 * than replacing it; see {@link mergeAllocation}.
 */
export async function runAllocation(scenarioId: string, allocation: number): Promise<SimComparison> {
  return asComparison(await c3Action('SimRunner', 'runAllocation', [scenarioId, allocation]));
}

/**
 * `SimRunner.exportBundle(scenarioId, maxExtraBuses)` — the self-contained handoff bundle.
 *
 * Returned as opaque JSON: it is downloaded verbatim, never parsed for display.
 */
export async function fetchExportBundle(scenarioId: string, maxExtraBuses: number): Promise<unknown> {
  const bundle = await c3Action('SimRunner', 'exportBundle', [scenarioId, maxExtraBuses]);
  if (bundle == null) throw new ContractError('SimRunner.exportBundle returned nothing.');
  return bundle;
}

/**
 * `SimRunner.eventTimeline(scenarioId)` — per-event timeline descriptor.
 *
 * NOTE: this action currently throws server-side in the `js-server` runtime
 * (`TurboJs Object doesn't support put(visibleToPlanner)` — it mutates the
 * result of `SimEvent#toJson()`), so nothing on this page depends on it. The
 * wrapper is kept so the panel can be wired up once the backend is fixed; the
 * event list rendered today comes from `comparison.input.events` and
 * `SimResults.eventActivations`, which are part of the verified contract.
 */
export async function fetchEventTimeline(scenarioId: string): Promise<unknown> {
  return normalizeArrays(await c3Action('SimRunner', 'eventTimeline', [scenarioId]));
}

// ---------------------------------------------------------------- selectors

/** The candidate for `allocation`, or null when the loaded sweep does not cover it. */
export function candidateFor(comparison: SimComparison, allocation: number): SimResults | null {
  return comparison.candidates.find((c) => c.allocation === allocation) ?? null;
}

/** The plan for `allocation`, or null when the loaded sweep does not cover it. */
export function planFor(comparison: SimComparison, allocation: number): SimPlan | null {
  return comparison.plans.find((p) => p.allocation === allocation && p.planKind === 'Candidate') ?? null;
}

/** Allocations present in the loaded sweep, ascending. */
export function loadedAllocations(comparison: SimComparison): number[] {
  return comparison.candidates.map((c) => c.allocation).sort((a, b) => a - b);
}

/**
 * Folds a single-allocation `runAllocation` response into a loaded sweep.
 *
 * The candidate, plan and cost-curve point for that allocation are replaced;
 * everything else — including the demand snapshot the comparison rests on — is
 * left untouched, because both calls share the same snapshot by construction.
 */
export function mergeAllocation(sweep: SimComparison, single: SimComparison): SimComparison {
  const fresh = single.candidates.filter((c) => c.planKind === 'Candidate');
  if (fresh.length === 0) return sweep;
  const allocations = new Set(fresh.map((c) => c.allocation));
  const freshPlans = single.plans.filter((p) => p.planKind === 'Candidate' && allocations.has(p.allocation));
  const freshCurve = single.costCurve.filter((p) => allocations.has(p.allocation));
  const byAllocation = (a: { allocation: number }, b: { allocation: number }) => a.allocation - b.allocation;
  return {
    ...sweep,
    candidates: [...sweep.candidates.filter((c) => !allocations.has(c.allocation)), ...fresh].sort(byAllocation),
    plans: [...sweep.plans.filter((p) => !(p.planKind === 'Candidate' && allocations.has(p.allocation))), ...freshPlans].sort(byAllocation),
    costCurve: [...sweep.costCurve.filter((p) => !allocations.has(p.allocation)), ...freshCurve].sort(byAllocation),
    comparabilityAssertions: single.comparabilityAssertions,
    computedAt: single.computedAt,
  };
}

/** Splits `PASS - …` / `FAIL - …` / `NOT CHECKED - …` into verdict and prose. */
export function parseAssertion(raw: string): ParsedAssertion {
  for (const verdict of ['NOT CHECKED', 'PASS', 'FAIL'] as const) {
    if (raw.startsWith(`${verdict} - `)) return { verdict, text: raw.slice(verdict.length + 3) };
  }
  return { verdict: 'UNKNOWN', text: raw };
}

/**
 * Per-stop roll-up of {@link SimStopWindowDelay} rows, for the map.
 *
 * `worstWaitMinutes` is null when **no** window at that stop had observations —
 * which is a no-data stop, not a zero-wait stop.
 */
export interface StopDelaySummary {
  stopId: StopId;
  stopName: string | null;
  worstWaitMinutes: number | null;
  observedWindows: number;
  supportingPassengerCount: number;
  censoredPassengerCount: number;
  everUnavailable: boolean;
}

export function summarizeStopDelays(delays: SimStopWindowDelay[]): Map<StopId, StopDelaySummary> {
  const byStop = new Map<StopId, StopDelaySummary>();
  for (const row of delays) {
    let entry = byStop.get(row.stopId);
    if (!entry) {
      entry = {
        stopId: row.stopId,
        stopName: row.stopName ?? null,
        worstWaitMinutes: null,
        observedWindows: 0,
        supportingPassengerCount: 0,
        censoredPassengerCount: 0,
        everUnavailable: false,
      };
      byStop.set(row.stopId, entry);
    }
    if (row.stopName && !entry.stopName) entry.stopName = row.stopName;
    if (row.hasObservations) {
      entry.observedWindows += 1;
      entry.supportingPassengerCount += row.supportingPassengerCount ?? 0;
      entry.censoredPassengerCount += row.censoredPassengerCount ?? 0;
      if (row.estimatedWaitMinutes != null) {
        entry.worstWaitMinutes = Math.max(entry.worstWaitMinutes ?? 0, row.estimatedWaitMinutes);
      }
    }
    if (row.stopUnavailableInWindow) entry.everUnavailable = true;
  }
  return byStop;
}

/** One column of the delay heatmap, derived from the delay rows themselves. */
export interface DelayWindow {
  start: string;
  end: string;
  startMs: number;
}

/** The union of reporting windows across every supplied delay set, ascending. */
export function delayWindows(...sets: SimStopWindowDelay[][]): DelayWindow[] {
  const byStart = new Map<string, DelayWindow>();
  for (const set of sets) {
    for (const row of set) {
      if (!byStart.has(row.windowStart)) {
        byStart.set(row.windowStart, { start: row.windowStart, end: row.windowEnd, startMs: Date.parse(row.windowStart) });
      }
    }
  }
  return [...byStart.values()].sort((a, b) => a.startMs - b.startMs);
}

/** Rows of the delay heatmap: stops that appear in the delay data, in core-service order. */
export function delayStops(stops: SimStop[], ...sets: SimStopWindowDelay[][]): { stopId: StopId; name: string }[] {
  const names = new Map<StopId, string>();
  for (const set of sets) {
    for (const row of set) {
      if (!names.has(row.stopId)) names.set(row.stopId, row.stopName ?? row.stopId);
    }
  }
  const ordered: { stopId: StopId; name: string }[] = [];
  for (const stop of stops) {
    if (names.has(stop.id)) {
      ordered.push({ stopId: stop.id, name: stop.name });
      names.delete(stop.id);
    }
  }
  for (const [stopId, name] of names) ordered.push({ stopId, name });
  return ordered;
}

/**
 * Builds the stop-name lookup from whatever the loaded run actually carries.
 *
 * Core-service stops win; delay rows fill in anything the core service omits.
 * An unknown id resolves to itself — the page shows the raw id rather than a
 * plausible-looking invented name.
 */
export function buildStopNames(stops: SimStop[], ...sets: SimStopWindowDelay[][]): Map<StopId, string> {
  const names = new Map<StopId, string>();
  for (const set of sets) {
    for (const row of set) {
      if (row.stopName) names.set(row.stopId, row.stopName);
    }
  }
  for (const stop of stops) names.set(stop.id, stop.name);
  return names;
}
