/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

/**
 * ============================================================================
 *  Surge Capacity Planning — DATA LAYER
 * ============================================================================
 *
 * This module is the ONLY place the Surge Planning feature talks to for data.
 * Today it serves hand-authored MOCK data (see {@link mockSurgeDataSource}).
 *
 * To swap in real C3 backend data later, you only need to:
 *   1. Implement the {@link SurgeDataSource} interface against `c3Action`
 *      (a scaffold is provided below as `c3SurgeDataSource`).
 *   2. Change the single export at the bottom:
 *        export const surgeDataSource = c3SurgeDataSource;
 *   3. Delete the mock constants.
 *
 * No React/UI code imports the mock data directly — everything goes through
 * `surgeDataSource`, so the components never need to change.
 * ============================================================================
 */

/** `[latitude, longitude]` in WGS84 decimal degrees. */
export type LatLng = [number, number];

/** Load buckets used to color routes and buses by how crowded they are. */
export type LoadLevel = 'ok' | 'busy' | 'overloaded';

/** A single simulated bus moving along a route. */
export interface BusSpec {
  /** Unique id within its route. */
  id: string;
  /** Starting position along the route path, as a fraction `[0, 1)`. */
  offset: number;
  /** Relative speed multiplier (1 = baseline). */
  speed: number;
  /** Occupancy `0..1`; drives the bus marker color. */
  load: number;
}

/** A bus route: a geographic path plus the fleet running on it. */
export interface RouteDef {
  id: string;
  /** Display name, e.g. "Green St Corridor". */
  name: string;
  /** Ordered geographic waypoints the buses follow. */
  path: LatLng[];
  /** Buses currently assigned to this route. */
  buses: BusSpec[];
  /** Overall corridor load `0..1` (peak occupancy). Drives route color/weight. */
  loadFactor: number;
  /** True when this route is new/added in the optimized plan. */
  isNew?: boolean;
}

/** A full routing plan — the set of routes shown on one map. */
export interface RoutePlan {
  id: string;
  label: string;
  routes: RouteDef[];
}

/** Headline numbers shown under each map. */
export interface AggregateStats {
  avgWaitMin: number;
  overcrowdingPct: number;
  onTimePct: number;
  busesDeployed: number;
  passengersServed: number;
}

/** A node in a before/after schematic (coordinates in a 0..200 × 0..120 box). */
export interface SchematicNode {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Rendered larger when this is a major demand hub. */
  hub?: boolean;
}

/** A directed flow between two schematic nodes, weighted by load `0..1`. */
export interface SchematicEdge {
  from: string;
  to: string;
  load: number;
  /** Dashed = planned/absent service rather than an active heavy flow. */
  dashed?: boolean;
}

/** A small abstract diagram of how passengers flow before vs. after. */
export interface Schematic {
  nodes: SchematicNode[];
  edges: SchematicEdge[];
}

/** One "before → after" improvement surfaced by the optimizer. */
export interface OptimizationOpportunity {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  before: { statLabel: string; stats: string[]; schematic: Schematic };
  after: { statLabel: string; stats: string[]; schematic: Schematic };
}

/** The simulated event the plan is built around (mocked inputs from screen 1). */
export interface SimulatedEvent {
  name: string;
  venue: string;
  windowLabel: string;
  /** Start/end of the simulated window, used to label the replay slider. */
  startClock: string;
  endClock: string;
  expectedAttendance: number;
  excessBuses: number;
}

/** The complete payload the page renders. */
export interface SurgePlan {
  event: SimulatedEvent;
  oldPlan: RoutePlan;
  optimizedPlan: RoutePlan;
  oldStats: AggregateStats;
  optimizedStats: AggregateStats;
  opportunities: OptimizationOpportunity[];
  /** Shared map view for both maps. */
  mapCenter: LatLng;
  mapZoom: number;
}

/** The contract the UI depends on. Mock and real implementations both satisfy it. */
export interface SurgeDataSource {
  /** Load the full surge plan (event + both plans + stats + opportunities). */
  getSurgePlan(): Promise<SurgePlan>;
}

/* ========================================================================= *
 *  MOCK DATA — real UIUC / MTD geography, hand-authored for the prototype.
 *  (Coordinates follow actual campus streets so the maps look authentic.)
 * ========================================================================= */

// --- Real-world UIUC landmarks (approximate WGS84) -------------------------
const GREEN_ST: LatLng[] = [
  [40.11025, -88.2435], // First & Green
  [40.1102, -88.2338], // Fourth & Green
  [40.11018, -88.2272], // Wright & Green (campustown core)
  [40.1103, -88.2195], // Goodwin & Green
  [40.11045, -88.213], // Lincoln & Green (Urbana)
];

const WRIGHT_ST: LatLng[] = [
  [40.1165, -88.2272], // University & Wright
  [40.114, -88.2272],
  [40.11018, -88.2272], // Green & Wright
  [40.1055, -88.2274], // Armory & Sixth
  [40.102, -88.2278], // Kirby / Florida
];

const UNIVERSITY_AVE: LatLng[] = [
  [40.1165, -88.243],
  [40.1165, -88.232],
  [40.1165, -88.221],
  [40.1165, -88.213],
];

const SPRINGFIELD_AVE: LatLng[] = [
  [40.1138, -88.2435], // First & Springfield
  [40.1138, -88.2338],
  [40.1138, -88.2272], // Wright & Springfield
  [40.1138, -88.2195],
];

const STADIUM_SURGE: LatLng[] = [
  [40.11018, -88.2272], // Wright & Green (campus hub)
  [40.1055, -88.2274],
  [40.102, -88.2355], // First St south
  [40.0999, -88.2359], // Memorial Stadium
  [40.096, -88.236], // State Farm Center
];

function buses(count: number, load: number, speed = 1): BusSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i + 1}`,
    offset: i / count,
    speed: speed * (0.9 + ((i % 3) * 0.1)),
    load,
  }));
}

const OLD_PLAN: RoutePlan = {
  id: 'old',
  label: 'Current plan',
  routes: [
    { id: 'green', name: 'Green St Corridor', path: GREEN_ST, loadFactor: 0.96, buses: buses(8, 0.95) },
    { id: 'wright', name: 'Wright St Line', path: WRIGHT_ST, loadFactor: 0.55, buses: buses(3, 0.55) },
    { id: 'univ', name: 'University Ave Line', path: UNIVERSITY_AVE, loadFactor: 0.42, buses: buses(2, 0.42) },
  ],
};

const OPTIMIZED_PLAN: RoutePlan = {
  id: 'optimized',
  label: 'Optimized plan',
  routes: [
    { id: 'green', name: 'Green St Corridor', path: GREEN_ST, loadFactor: 0.66, buses: buses(5, 0.64) },
    { id: 'wright', name: 'Wright St Line', path: WRIGHT_ST, loadFactor: 0.5, buses: buses(3, 0.5) },
    { id: 'univ', name: 'University Ave Line', path: UNIVERSITY_AVE, loadFactor: 0.44, buses: buses(2, 0.44) },
    {
      id: 'reliever',
      name: 'Springfield Reliever (new)',
      path: SPRINGFIELD_AVE,
      loadFactor: 0.58,
      buses: buses(3, 0.58, 1.1),
      isNew: true,
    },
    {
      id: 'surge',
      name: 'State Farm Surge Shuttle (new)',
      path: STADIUM_SURGE,
      loadFactor: 0.7,
      buses: buses(3, 0.7, 1.15),
      isNew: true,
    },
  ],
};

const OLD_STATS: AggregateStats = {
  avgWaitMin: 11.2,
  overcrowdingPct: 38,
  onTimePct: 72,
  busesDeployed: 13,
  passengersServed: 18400,
};

const OPTIMIZED_STATS: AggregateStats = {
  avgWaitMin: 6.4,
  overcrowdingPct: 12,
  onTimePct: 91,
  busesDeployed: 16,
  passengersServed: 23100,
};

const OPPORTUNITIES: OptimizationOpportunity[] = [
  {
    id: 'green-overload',
    title: 'Green St → Campustown heavily overloaded',
    description:
      'All inbound demand funnels onto the Green St corridor at tip-off, driving pass-ups and bunching between Wright and Lincoln. The optimizer shifts a share of trips onto a parallel Springfield Ave reliever.',
    severity: 'high',
    before: {
      statLabel: 'Current',
      stats: ['Peak load 96%', 'Avg wait 11 min', '3 pass-ups / hr'],
      schematic: {
        nodes: [
          { id: 'A', label: 'First', x: 24, y: 60 },
          { id: 'B', label: 'Wright', x: 100, y: 60, hub: true },
          { id: 'C', label: 'Lincoln', x: 176, y: 60 },
        ],
        edges: [
          { from: 'A', to: 'B', load: 0.96 },
          { from: 'B', to: 'C', load: 0.9 },
        ],
      },
    },
    after: {
      statLabel: 'Optimized',
      stats: ['Peak load 66%', 'Avg wait 6 min', '0 pass-ups / hr'],
      schematic: {
        nodes: [
          { id: 'A', label: 'First', x: 24, y: 78 },
          { id: 'B', label: 'Wright', x: 100, y: 78, hub: true },
          { id: 'C', label: 'Lincoln', x: 176, y: 78 },
          { id: 'A2', label: 'Spfld W', x: 24, y: 30 },
          { id: 'B2', label: 'Spfld E', x: 176, y: 30 },
        ],
        edges: [
          { from: 'A', to: 'B', load: 0.64 },
          { from: 'B', to: 'C', load: 0.6 },
          { from: 'A2', to: 'B2', load: 0.58 },
        ],
      },
    },
  },
  {
    id: 'stadium-access',
    title: 'No direct service to State Farm Center on event nights',
    description:
      'Fans transfer twice to reach the arena, adding walk time and crowding the campus hub. The optimizer adds a dedicated surge shuttle from the Wright St hub straight to Memorial Stadium and State Farm Center.',
    severity: 'medium',
    before: {
      statLabel: 'Current',
      stats: ['0 dedicated buses', '18 min walk + transfer', '2 transfers'],
      schematic: {
        nodes: [
          { id: 'H', label: 'Campus hub', x: 40, y: 30, hub: true },
          { id: 'S', label: 'State Farm', x: 160, y: 95, hub: true },
        ],
        edges: [{ from: 'H', to: 'S', load: 0.1, dashed: true }],
      },
    },
    after: {
      statLabel: 'Optimized',
      stats: ['3 surge buses', '7 min direct', '0 transfers'],
      schematic: {
        nodes: [
          { id: 'H', label: 'Campus hub', x: 40, y: 30, hub: true },
          { id: 'S', label: 'State Farm', x: 160, y: 95, hub: true },
        ],
        edges: [{ from: 'H', to: 'S', load: 0.7 }],
      },
    },
  },
];

const MOCK_PLAN: SurgePlan = {
  event: {
    name: "Illini Men's Basketball vs. Purdue",
    venue: 'State Farm Center',
    windowLabel: 'Tip-off 7:00 PM',
    startClock: '6:00 PM',
    endClock: '8:00 PM',
    expectedAttendance: 15500,
    excessBuses: 4,
  },
  oldPlan: OLD_PLAN,
  optimizedPlan: OPTIMIZED_PLAN,
  oldStats: OLD_STATS,
  optimizedStats: OPTIMIZED_STATS,
  opportunities: OPPORTUNITIES,
  mapCenter: [40.1065, -88.2285],
  mapZoom: 14,
};

/**
 * Mock implementation — resolves hand-authored data. Swap this out for
 * {@link c3SurgeDataSource} once the backend types/endpoints exist.
 */
export const mockSurgeDataSource: SurgeDataSource = {
  getSurgePlan() {
    // Simulate a network round-trip so loading states are exercised.
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_PLAN), 250));
  },
};

/**
 * SCAFFOLD for the real backend. When C3 entity types exist (e.g. `SurgePlan`,
 * `BusRoute`, `OptimizationOpportunity`), implement this with `c3Action` and
 * flip the `surgeDataSource` export below. Shown as a reference, not wired up.
 *
 * Example of the shape the real implementation would take:
 *
 *   import { c3Action } from '@/c3Action';
 *   export const c3SurgeDataSource: SurgeDataSource = {
 *     async getSurgePlan() {
 *       const res = await c3Action('SurgePlan', 'fetch', {
 *         limit: 1,
 *         include: 'this, oldPlan.routes.path, optimizedPlan.routes.path, opportunities',
 *       });
 *       const plan = res.objs?.[0];
 *       // ...map the C3 record into the SurgePlan shape above...
 *       return plan as SurgePlan;
 *     },
 *   };
 */

/** The single switch the whole feature reads. Change the right-hand side to go live. */
export const surgeDataSource: SurgeDataSource = mockSurgeDataSource;

/** Map a numeric load `0..1` to a severity bucket. */
export function loadLevel(load: number): LoadLevel {
  if (load >= 0.85) return 'overloaded';
  if (load >= 0.6) return 'busy';
  return 'ok';
}

/** Hex colors for each load level (kept here so maps + schematics stay in sync). */
export const LOAD_COLORS: Record<LoadLevel, string> = {
  ok: '#16a34a',
  busy: '#f59e0b',
  overloaded: '#dc2626',
};
