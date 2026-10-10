/**
 * Typed boundary for the **real** `SimRunner` backend contract.
 *
 * Every interface below mirrors a C3 type in `src/simulator/`. The page renders
 * what the backend returns; it does not compute simulation results in the
 * browser and it does not invent values for fields the backend leaves null.
 *
 * Conventions carried over from the backend:
 * - Timestamps are ISO-8601 strings. The backend emits a mix of explicit-offset
 *   (`...-05:00`) and UTC (`...Z`) instants; always render them through the
 *   scenario's {@link SimScenario.serviceTimezone}, never with a hardcoded offset.
 * - Durations in metrics are MINUTES. Money is in `SimCostConfig.currency`.
 * - Confidence / reputation / applied weight are 0–1 heuristic weights, NOT
 *   calibrated probabilities.
 * - `number | null` means "the backend could not compute this". Render it as an
 *   explicit no-data state — never as 0.
 *
 * Collections are declared as arrays here. `api.ts` normalizes the response
 * before it reaches these types, because C3 serializes `[T]` fields as either a
 * JSON array or a numerically-keyed object depending on the runtime.
 */

/** Contract version every object in a comparison carries. */
export const CONTRACT_VERSION = '1.0.0';

export type IsoTimestamp = string;
export type StopId = string;
export type RouteId = string;
export type BusId = string;
export type TripId = string;
export type EventId = string;
export type ScenarioId = string;

// ------------------------------------------------------------------ Scenario

/** `SimCostConfig` — how supplemental-bus operating cost is charged. */
export interface SimCostConfig {
  currency: string;
  fixedCostPerAllocatedBus: number;
  costPerOperatingMinute: number;
  costPerDeadheadMinute: number;
  costPerDwellMinute: number;
  /** When true an allocated-but-idle bus still carries its fixed cost. */
  includeIdleAllocatedBuses: boolean;
}

/** `SimAssumptions` — every modelling knob, per scenario. Nothing is hidden in the engine. */
export interface SimAssumptions {
  defaultDwellMinutes: number;
  boardingSecondsPerPassenger: number;
  alightingSecondsPerPassenger: number;
  reliabilityPolicy: string;
  defaultConfidence: number;
  defaultReputation: number;
  maxTravelTimeMultiplier: number;
  overlappingMultiplierRule: string;
  cohortOverlapPolicy: string;
  reportMatchWindowMinutes: number;
  allowTransfers: boolean;
  queueDiscipline: string;
  arrivalWindowDistribution: string;
  /** Width of each reporting window in `SimStopWindowDelay`, in minutes. */
  stopDelayWindowMinutes: number;
  deadheadSpeedKmPerHour: number;
  minTurnaroundMinutes: number;
}

/** `SimScenario` — one runnable synthetic fixture, as returned by `SimRunner.listScenarios`. */
export interface SimScenario {
  id: ScenarioId;
  name: string;
  description?: string;
  serviceDate: string;
  serviceTimezone: string;
  horizonStart: IsoTimestamp;
  horizonEnd: IsoTimestamp;
  /** Instant the plan is frozen. Events known after this are realized but invisible to the planner. */
  planningCutoff: IsoTimestamp;
  randomSeed: number;
  maxExtraBuses: number;
  costConfig: SimCostConfig;
  assumptions: SimAssumptions;
  contractVersion?: string;
  syntheticDataLabel?: string;
  scenarioTags: string[];
  /** Always true in this package — every scenario is a synthetic fixture. */
  isSynthetic: boolean;
}

// ------------------------------------------------------------- Core service

/** `SimStop` — a real geographic stop (WGS84), unlike the schematic coordinates of the old mockup. */
export interface SimStop {
  id: StopId;
  name: string;
  scenarioId: ScenarioId;
  latitude: number;
  longitude: number;
  isCoreStop: boolean;
  stopCode?: string;
  isSynthetic: boolean;
}

/** `SimRouteDef` — a fixed MTD route as an ordered stop sequence. */
export interface SimRouteDef {
  id: RouteId;
  name: string;
  scenarioId: ScenarioId;
  description?: string;
  isCore: boolean;
  stopSequence: StopId[];
  isSynthetic: boolean;
}

/** `SimTravelLink` — baseline travel time between two stops. */
export interface SimTravelLink {
  id: string;
  scenarioId: ScenarioId;
  fromStopId: StopId;
  toStopId: StopId;
  baselineTravelMinutes: number;
  distanceKm?: number;
}

/** `SimCoreServiceInput` — the fixed core service, identical in baseline and every candidate. */
export interface SimCoreServiceInput {
  stops: SimStop[];
  routes: SimRouteDef[];
  travelLinks: SimTravelLink[];
  /** Core trips are referenced by id only; the UI needs the count, not the timetable. */
  coreTrips: { id: string; routeId: RouteId; capacity: number }[];
}

/** `SimExtraBus` — a supplemental bus offered by the availability adapter. */
export interface SimExtraBus {
  id: BusId;
  name?: string;
  scenarioId: ScenarioId;
  capacity: number;
  availableFrom: IsoTimestamp;
  availableTo: IsoTimestamp;
  startStopId: StopId;
  fixedCostPerDay: number;
  costPerOperatingMinute: number;
  costPerDeadheadMinute: number;
  costPerDwellMinute: number;
  currency: string;
}

// ------------------------------------------------------------ Source inputs

/** `SimEvent#demandEffect` — how an event turns attendance into riders. */
export interface SimDemandEffect {
  cohortId?: string;
  attendance?: number;
  busUseShare?: number;
  generatesInbound?: boolean;
  generatesOutbound?: boolean;
  classDeadlineOffsetMin?: number;
}

/** `SimEvent` — a demand or operational event in the assembled input. */
export interface SimEvent {
  id: EventId;
  name: string;
  scenarioId: ScenarioId;
  eventType: string;
  startTime: IsoTimestamp;
  endTime?: IsoTimestamp;
  /** When the event became known. Compared against `planningCutoff` for planner visibility. */
  knownAt?: IsoTimestamp;
  affectedStopIds: StopId[];
  eventSource: string;
  /** Absent when the producer supplied no confidence; `SimAssumptions.defaultConfidence` then applies. */
  confidence?: number;
  demandEffect?: SimDemandEffect;
  notes?: string;
  isSynthetic: boolean;
}

/** `SimEventReport` — an auto-detected or manually submitted sighting of an event. */
export interface SimEventReport {
  id: string;
  scenarioId: ScenarioId;
  reportedEventName?: string;
  reportSource: string;
  submittingUserId?: string;
  reportedStopId?: StopId;
  reportedStartTime?: IsoTimestamp;
  reportedEndTime?: IsoTimestamp;
  reportedAttendance?: number;
  reportedConfidence?: number;
  reportTime?: IsoTimestamp;
}

// ----------------------------------------------------------- Reconciliation

/**
 * `SimReconciliationEntry` — one decision the input assembler made and why.
 *
 * `entryKind` is an open string from the backend enum: `ReportMatchedByCanonicalId`,
 * `ReportMatchedByFallback`, `ReportUnmatched`, `DuplicateEventSuppressed`,
 * `CohortOverlapResolved`, `ReliabilityWeightApplied`.
 */
export interface SimReconciliationEntry {
  entryKind: string;
  targetEventId?: EventId;
  contributingReportIds: string[];
  policy?: string;
  rationale?: string;
  /** Null when the producer supplied none — rendered as "default", never as 0. */
  confidenceUsed?: number;
  reputationUsed?: number;
  appliedWeight?: number;
}

/** `SimReconciliationTrace` — the full set of reconciliation decisions plus the policies in force. */
export interface SimReconciliationTrace {
  entries: SimReconciliationEntry[];
  reliabilityPolicy: string;
  cohortOverlapPolicy: string;
  policyNotes: string[];
}

/** `SimValidationIssue` — one input or feasibility problem. Reported, never repaired. */
export interface SimValidationIssue {
  severity: 'Error' | 'Warning' | 'Info';
  code: string;
  message: string;
  refKind?: string;
  refId?: string;
}

/** `SimValidationReport` — issue roll-up for an input or a plan. */
export interface SimValidationReport {
  isValid: boolean;
  issues: SimValidationIssue[];
  errorCount: number;
  warningCount: number;
}

// ---------------------------------------------------------- Assembled input

/** `SimulationInput` — everything every run of a comparison shared. */
export interface SimulationInput {
  contractVersion: string;
  scenarioId: ScenarioId;
  serviceDate: string;
  serviceTimezone: string;
  horizonStart: IsoTimestamp;
  horizonEnd: IsoTimestamp;
  planningCutoff: IsoTimestamp;
  randomSeed: number;
  maxExtraBuses: number;
  events: SimEvent[];
  studentLocationEstimates: { id: string; cohortId?: string }[];
  eventEstimates: { id: string; event?: string }[];
  eventReports: SimEventReport[];
  reputationScores: { id: string; score?: number }[];
  coreService: SimCoreServiceInput;
  extraBuses: SimExtraBus[];
  costConfig: SimCostConfig;
  assumptions: SimAssumptions;
  reconciliation: SimReconciliationTrace;
  validation: SimValidationReport;
  syntheticDataLabel: string;
  assembledAt?: IsoTimestamp;
}

// ------------------------------------------------------------------ Demand

/** `SimDemandTraceEntry` — source-to-journey arithmetic for one demand source. */
export interface SimDemandTraceEntry {
  sourceEventId?: EventId;
  sourceEstimateId?: string;
  sourceKind: string;
  legKind?: string;
  attendance?: number;
  busUseShare?: number;
  appliedWeight?: number;
  expectedPassengers?: number;
  generatedPassengers?: number;
  policy?: string;
  windowStart?: IsoTimestamp;
  windowEnd?: IsoTimestamp;
}

/**
 * `SimDemandSnapshot` — the immutable demand every run of a comparison consumed.
 *
 * `journeys` is deliberately omitted: it is a large per-passenger array the page
 * never renders. Only the aggregates and id sets below are consumed.
 */
export interface SimDemandSnapshot {
  snapshotId: string;
  scenarioId: ScenarioId;
  seed: number;
  totalPassengers: number;
  deadlineBearingPassengers: number;
  trace: SimDemandTraceEntry[];
  realizedEventIds: EventId[];
  /** Events realized but invisible to the planner — the disruptions the plan absorbed blind. */
  eventIdsUnknownAtCutoff: EventId[];
  suppressedEventIds: EventId[];
}

// ------------------------------------------------------------ Plan / results

/** `SimItineraryStop` — one planned call at a stop. Times are what the plan says. */
export interface SimItineraryStop {
  stopId: StopId;
  arrivalTime: IsoTimestamp;
  departureTime: IsoTimestamp;
  stopSequenceIndex: number;
  isDeadhead: boolean;
  plannedBoardings: number;
  plannedAlightings: number;
}

/** `SimItineraryTrip` — one supplemental trip, with the bottleneck it targets and why. */
export interface SimItineraryTrip {
  tripId: TripId;
  tripIndex: number;
  stops: SimItineraryStop[];
  targetStopId?: StopId;
  targetDestinationStopId?: StopId;
  targetWindowStart?: IsoTimestamp;
  targetWindowEnd?: IsoTimestamp;
  expectedBoardings?: number;
  expectedWaitingMinutesSaved?: number;
  explanation?: string;
}

/** `SimBusItinerary` — the whole day for one allocated extra bus. */
export interface SimBusItinerary {
  busId: BusId;
  busLabel?: string;
  allocationIndex: number;
  capacity: number;
  trips: SimItineraryTrip[];
  totalOperatingMinutes: number;
  totalDeadheadMinutes: number;
  totalDwellMinutes: number;
  /** Allocated but running nothing. Not a failure — the signal that the allocation has saturated. */
  isIdle: boolean;
  explanation?: string;
  operatingCost: number;
}

/** `SimPlan` — the supplemental-service plan evaluated at one allocation. */
export interface SimPlan {
  planId: string;
  planKind: 'MockOldModelBaseline' | 'Candidate';
  scenarioId: ScenarioId;
  allocation: number;
  extraBusItineraries: SimBusItinerary[];
  coreTripIds: string[];
  planningCutoff: IsoTimestamp;
  eventIdsVisibleToPlanner: EventId[];
  explanations: string[];
  heuristicVersion?: string;
  validation?: SimValidationReport;
  totalOperatingCost: number;
  busesUsed: number;
  busesIdle: number;
}

/**
 * `SimMetrics` — headline metrics with their denominators.
 *
 * Averages are over COMPLETED passengers only and are subject to survivor bias;
 * read them next to `unservedAtHorizon` and `accruedWaitingMinutesUnserved`.
 */
export interface SimMetrics {
  avgWaitMinutesCompleted: number | null;
  p95WaitMinutesCompleted: number | null;
  totalWaitingMinutesCompleted: number;
  /** Horizon-based total, including wait accrued by passengers still queued at the horizon. */
  horizonTotalWaitingMinutes: number;
  accruedWaitingMinutesUnserved: number;
  completedPassengers: number;
  /** Baseline minus candidate, NOT clamped — a harmful allocation reports a negative saving. */
  horizonWaitingMinutesSavedVsBaseline: number;
  avgTripTimeMinutesCompleted: number | null;
  avgInVehicleMinutesCompleted: number | null;
  lateCompletedPassengers: number;
  deadlineBearingPassengers: number;
  lateCompletedPct: number | null;
  deadlineBearingUnserved: number;
  unservedAtHorizon: number;
  extraBusOperatingCost: number;
  currency: string;
  /** Null when savings are zero or negative; `costPerMinuteSavedUnavailableReason` then says why. */
  costPerWaitingMinuteSaved: number | null;
  costPerMinuteSavedUnavailableReason?: string;
  costBasisNote?: string;
  denominatorNote?: string;
}

/**
 * `SimStopWindowDelay` — expected wait at one stop in one reporting window.
 *
 * `hasObservations: false` means no simulated passenger waited there in that
 * window. That is NOT a zero-minute wait and must never be rendered as one.
 */
export interface SimStopWindowDelay {
  stopId: StopId;
  stopName?: string;
  windowStart: IsoTimestamp;
  windowEnd: IsoTimestamp;
  estimatedWaitMinutes: number | null;
  supportingPassengerCount: number;
  hasObservations: boolean;
  censoredPassengerCount: number;
  maxWaitMinutes: number | null;
  stopUnavailableInWindow: boolean;
}

/** `SimAccounting` — the passenger conservation check that makes the other metrics trustworthy. */
export interface SimAccounting {
  generatedPassengers: number;
  completedPassengers: number;
  waitingAtHorizon: number;
  onboardAtHorizon: number;
  deniedByClosure: number;
  /** False is an engine bug; the UI shows it as an error rather than rendering the metrics as sound. */
  isBalanced: boolean;
  peakOnboard: number;
  totalBoardings: number;
  totalAlightings: number;
}

/** `SimEventActivation` — one event becoming active during a run. */
export interface SimEventActivation {
  eventId: EventId;
  eventName?: string;
  eventType?: string;
  activationTime: IsoTimestamp;
  deactivationTime?: IsoTimestamp;
  visibleToPlanner: boolean;
  effectSummary?: string;
  affectedIds: string[];
  generatedPassengers: number;
  operationalEffectKinds: string[];
  appliedWeight?: number;
}

/**
 * `SimResults` — the outcome of simulating one plan against one demand snapshot.
 *
 * `replayFrames` is omitted: it is a dense presentational time series the page
 * does not render.
 */
export interface SimResults {
  resultsId: string;
  scenarioId: ScenarioId;
  contractVersion: string;
  snapshotId: string;
  seed: number;
  planId: string;
  planKind: string;
  allocation: number;
  metrics: SimMetrics;
  stopWindowDelays: SimStopWindowDelay[];
  accounting: SimAccounting;
  eventActivations: SimEventActivation[];
  infeasibilities: SimValidationIssue[];
  unitsNote?: string;
  syntheticDataLabel?: string;
}

/** `SimCostCurvePoint` — one allocation on the cost-versus-time-saved curve. */
export interface SimCostCurvePoint {
  allocation: number;
  operatingCost: number;
  currency: string;
  horizonTotalWaitingMinutes: number;
  horizonWaitingMinutesSaved: number;
  avgWaitMinutesCompleted: number | null;
  p95WaitMinutesCompleted: number | null;
  lateCompletedPassengers: number;
  lateCompletedPct: number | null;
  unservedPassengers: number;
  costPerWaitingMinuteSaved: number | null;
  costPerMinuteSavedUnavailableReason?: string;
  busesUsed: number;
  busesIdle: number;
  planId: string;
  resultsId: string;
}

/** `SimComparison` — the whole "without changes vs. with these recommendations" result. */
export interface SimComparison {
  scenarioId: ScenarioId;
  scenarioName: string;
  contractVersion: string;
  input: SimulationInput;
  demandSnapshot: SimDemandSnapshot;
  baseline: SimResults;
  /** One per allocation, ascending. From `runComparison` this covers 0..max. */
  candidates: SimResults[];
  /** Aligned with `candidates` by `allocation`, plus the baseline plan. */
  plans: SimPlan[];
  costCurve: SimCostCurvePoint[];
  /** Each entry starts `PASS - `, `FAIL - ` or `NOT CHECKED - `. */
  comparabilityAssertions: string[];
  heuristicNotes: string[];
  scopeNotes: string[];
  syntheticDataLabel: string;
  computedAt?: IsoTimestamp;
}

/** Return shape of `SimRunner.describeScope` — the source for the synthetic/advisory banner. */
export interface SimScopeDescriptor {
  contractVersion: string;
  syntheticDataLabel: string;
  purpose: string;
  inScope: string[];
  outOfScope: string[];
  dataLabelling: string;
  keyAssumptionsNote: string;
  reliabilityNote: string;
  savingsNote: string;
}

/** An assertion string split into its verdict and its prose. */
export interface ParsedAssertion {
  verdict: 'PASS' | 'FAIL' | 'NOT CHECKED' | 'UNKNOWN';
  text: string;
}
