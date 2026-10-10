/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ReactElement } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  lastName: string;
  firstName: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
}

export interface SnackbarMessage {
  message: ReactElement;
  key: number;
  severity?: 'success' | 'info' | 'warning' | 'error';
  error?: boolean;
}

/** Sample / API document row (examples + fetchDocuments). */
export interface Document {
  documentName: string;
  program: string;
  owner: string;
  checklistApplied: string;
  attachments: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ProgramDocument {
  documentName: string;
  owner: string;
  status: string;
  uploadedAt: string;
}

/** Program row with optional nested documents (examples + fetchPrograms). */
export interface Program {
  id: string;
  program: string;
  totalDocuments: number;
  passed: number;
  failed: number;
  pending: number;
  documents?: ProgramDocument[];
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  estimatedTime: string;
}

/** A campus venue that can host events (bus-planning demand driver). */
export interface CampusVenue {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  capacity?: number;
  venueType?: string;
}

export type CampusEventCategory = 'Sports' | 'Concert' | 'Academic' | 'Conference' | 'Social' | 'Arts' | 'Other';

export type CampusEventSource = 'Manual' | 'Scraped';

export type CampusEventStatus = 'Scheduled' | 'Cancelled' | 'Completed';

/** A UIUC campus event — the unit of demand the bus-route optimizer plans around. */
export interface CampusEvent {
  id: string;
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  venue?: CampusVenue;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  expectedAttendance?: number;
  category?: CampusEventCategory;
  source: CampusEventSource;
  sourceUrl?: string;
  externalId?: string;
  status?: CampusEventStatus;
  reputationScore?: number;
  credibilityBasis?: string;
}

/** One competing value for a merged field, from a single contributing source. */
export interface FieldProvenanceEntry {
  value: string | number | boolean | null;
  source: CampusEventSource;
  sourceEventId: string;
  reputation: number;
}

/** Winning value for a merged field plus the alternatives it beat. */
export interface FieldProvenance extends FieldProvenanceEntry {
  alternatives: FieldProvenanceEntry[];
}

/** A candidate transit origin/destination for servicing a merged event. */
export interface StopCandidate {
  method: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  score: number;
  stopType: string;
}

/**
 * A canonical, deduplicated event produced by the EventResolver pipeline from one or more
 * raw CampusEvent observations detected as the same real-world event.
 */
export interface MergedEvent {
  id: string;
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  venue?: CampusVenue;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  category?: CampusEventCategory;
  status?: CampusEventStatus;
  reputationScore?: number;
  reputationBasis?: string;
  estimatedPopulation?: number;
  populationBasis?: string;
  sourceCount?: number;
  fieldProvenance?: Record<string, FieldProvenance>;
  startStopCandidates?: StopCandidate[];
  endStopCandidates?: StopCandidate[];
  clusterKey?: string;
  lastResolvedAt?: string;
}

/** One downstream stop on a route, with the arrival time for each departure. */
export interface RouteDestination {
  stop_id: string;
  name?: string;
  arrival_times: string[];
}

/** One distinct bus route (identified by its CUMTD bus number) serving a start stop. */
export interface BaselineRouteLine {
  /** CUMTD route short name — the rider-facing bus number (e.g. "22", "220 Illini"). */
  busNumber: string;
  routeId: string;
  routeColor?: string | null;
  /** Number of sampled scheduled trips on this route from the start stop (ranks the most-frequent top-10). */
  tripCount: number;
  departure_times: string[];
  destinations: RouteDestination[];
}

/** A route anchored at one start stop: when it leaves and where it goes. */
export interface RouteInfo {
  departure_times: string[];
  destinations: RouteDestination[];
  /**
   * Per-bus-number breakdown (most-frequent {@link BaselineRouteLine}s first, top 10). Present on CUMTD
   * baseline routes; absent on generated routes. The planner only reads the aggregate fields above.
   */
  lines?: BaselineRouteLine[];
}

/**
 * Baseline/generated route map keyed by start stop id — the exact shape returned by
 * {@link MtdRoutesClient#baselineRoutes} and {@link RoutePlanner#generateRoute}'s `route`.
 */
export type RouteMap = Record<string, RouteInfo>;

/** One stop-to-next-stop leg in a generated route plan. */
export interface RoutePlanLeg {
  from: string;
  to: string;
  minutes: number;
  meters: number;
}

/** A consolidated pickup stop produced by route convolution. */
export interface RoutePlanStop {
  stop_id: string;
  name: string;
  members: string[];
  demandWeight: number;
  estimatedRiders: number;
  latitude: number;
  longitude: number;
}

/** The transparent rationale accompanying a generated route. */
export interface RoutePlan {
  event: {
    id: string;
    name: string;
    startTime: string;
    venue?: string | null;
    demand: number;
    demandBasis: string;
  };
  service: {
    meanTimeToServiceMin: number;
    busCapacity: number;
    departuresNeeded: number;
    headwayMin: number;
    headwayForWaitMin: number;
    headwayForDemandMin: number;
    serviceWindowMin: number;
    busesScheduled: number;
    firstDeparture: string;
    lastDeparture: string;
  };
  travel: {
    basis: string;
    totalMinutes: number;
    legs: RoutePlanLeg[];
  };
  convolution: {
    kernelMeters: number;
    originCandidates: number;
    consolidatedStops: number;
    stops: RoutePlanStop[];
  };
  orderedStops: string[];
  baselineComparison: {
    knownStartStops: string[];
    baselineMedianHeadwayMin: number | null;
    note: string;
  };
}

/** Full result of {@link RoutePlanner#generateRoute}: the new route plus its rationale. */
export interface GeneratedRoute {
  route: RouteMap;
  plan: RoutePlan;
}

/** A physical vehicle assigned to a proposed route (one vehicle serves one route, no overlaps). */
export interface NetworkVehicle {
  vehicleId: string;
  capacity: number;
}

/** One ordered stop in a proposed route's sequence, with its demand and capacity-limited assignment. */
export interface NetworkOrderedStop {
  stop_id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Estimated riders boarding (origins) / alighting (destination) at this stop. */
  demand: number;
  /** Riders actually assigned here within capacity (= demand × route service fraction). */
  assigned: number;
}

/**
 * One proposed supplemental route (a demand corridor). Carries the full ordered stop sequence, the
 * actual event destination, the vehicles assigned to it, and the aligned departure/arrival timetable
 * ({@code departure_times[i]} matches each destination's {@code arrival_times[i]}).
 */
export interface NetworkRoute {
  routeId: string;
  routeName: string;
  proposed: boolean;
  direction: string;
  startStopId: string;
  pickupStop: { stop_id: string; name: string };
  destinationStop: { stop_id: string; name: string };
  orderedStops: NetworkOrderedStop[];
  /** Distinct boarding stops (destination excluded). */
  stopCount: number;
  totalSequenceStops: number;
  vehicles: NetworkVehicle[];
  vehicleCount: number;
  departure_times: string[];
  destinations: RouteDestination[];
  estimatedDemand: number;
  assignedRiders: number;
  unservedRiders: number;
  /** Runs the demand needs vs. runs the assigned fleet can actually schedule in the window. */
  requiredRuns: number;
  scheduledRuns: number;
  headwayMin: number;
  oneWayMin: number;
  roundTripMin: number;
  travelBasis: string;
  /** "verified" (Google Directions) or "preliminary" (haversine estimate, feasibility unverified). */
  estimationConfidence: string;
  schedulePreliminary: boolean;
  legs: RoutePlanLeg[];
  /** Set when a corridor is shorter than the stop target, explaining the exception. */
  note?: string | null;
}

/** One event's audited contribution to total network demand. */
export interface NetworkEventContribution {
  eventId: string;
  name: string;
  venue: string;
  startTime: string;
  attendance: number | null;
  attendanceBasis: string;
  transitShare: number;
  inboundDemand: number | null;
  outboundDemand: number | null;
  originStops: number;
}

/** The transparent rationale accompanying a generated route network. */
export interface NetworkPlan {
  window: { days: number; from: string; to: string };
  demand: {
    eventsConsidered: number;
    eventsUsed: number;
    eventsUnknownDemand: number;
    estimatedDemand: number;
    transitShare: number;
    meanEventStart: string;
    originStops: number;
    perEvent: NetworkEventContribution[];
  };
  fleet: {
    requested: number;
    used: number;
    busCapacity: number;
    meanTimeToServiceMin: number;
    targetStopsPerRoute: number;
    routeCount: number;
  };
  coverage: {
    estimatedDemand: number;
    assignedRiders: number;
    unservedRiders: number;
    /** Passenger service = assigned riders / estimated demand (NOT location coverage). */
    passengerServicePct: number;
    stopsTotal: number;
    stopsServed: number;
    /** Pickup-location coverage = served stops / total stops (reported separately from demand). */
    locationCoveragePct: number;
  };
  schedule: {
    status: 'verified' | 'preliminary';
    travelBasis: string;
    note: string;
  };
  baselineComparison: {
    knownStartStops: string[];
    baselineMedianHeadwayMin: number | null;
    note: string;
  };
  outboundNote: string;
}

/** Full result of {@link RoutePlanner#generateNetwork}: proposed routes plus the network rationale. */
export interface GeneratedNetwork {
  routes: NetworkRoute[];
  plan: NetworkPlan;
}

/** One mapped event's reconciliation row from {@link RouteNetworkSimBridge#buildScenario}. */
export interface SimBridgeReconEvent {
  eventId: string;
  name: string;
  attendance: number;
  transitShare: number;
  plannerInboundDemand: number | null;
  mappedInboundDemand: number;
  originStops: number;
  destinationStopId: string;
}

/** An error-severity validation finding surfaced by the bridge. */
export interface SimBridgeValidationError {
  code: string;
  message: string;
  refKind?: string;
  refId?: string;
}

/**
 * The mapping/validation report returned by `RouteNetworkSimBridge.buildScenario` — the planner's
 * output mapped into a scenario-scoped SurgePlanner (SimRunner) input, plus the reconciliation of
 * mapped rider demand against the planner's estimate and the simulator's validation result.
 */
export interface SimBridgeReport {
  scenarioId: string;
  maxExtraBuses: number;
  created: { stops: number; events: number; extraBuses: number; travelLinks: number };
  horizon: {
    horizonStart: string;
    horizonEnd: string;
    planningCutoff: string;
    serviceDate: string;
    serviceTimezone: string;
  };
  reconciliation: {
    plannerEstimatedDemand: number;
    mappedInboundDemand: number;
    match: boolean;
    note: string;
    perEvent: SimBridgeReconEvent[];
    skipped: { eventId: string; reason: string }[];
  };
  distinction: { existingMtd: string; proposedSupplemental: string };
  validation: {
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    errors: SimBridgeValidationError[];
  };
  simplifications: string[];
  missing: { item: string; whyItMatters: string; needed: string }[];
}
