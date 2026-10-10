/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { cn } from '@/lib/utils';

import { summarizeStopDelays, type StopDelaySummary } from '../api';
import type {
  RouteId,
  SimBusItinerary,
  SimEvent,
  SimRouteDef,
  SimStop,
  SimStopWindowDelay,
  StopId,
} from '../contracts/types';
import { NO_DATA, fmtMin, fmtNum, fmtPct } from '../format';

/** Concrete hex colours — Leaflet writes these straight into SVG stroke/fill,
 *  where CSS `var(--…)` tokens do not resolve, so the palette is inlined here. */
const WAIT_COLORS = {
  ok: '#16a34a',
  busy: '#f59e0b',
  severe: '#dc2626',
  none: '#9ca3af',
} as const;
const EXTRA_BUS_COLOR = '#2563eb';
/** The demand event itself (where the surge originates). Distinct from both the
 *  wait palette and the supplemental-bus blue so it reads as "the cause". */
const EVENT_COLOR = '#db2777';

type Band = keyof typeof WAIT_COLORS;
type LatLng = [number, number];

/** Worst-wait → colour band, matching the legend thresholds. */
function bandFor(worstWaitMinutes: number | null | undefined): Band {
  if (worstWaitMinutes == null) return 'none';
  if (worstWaitMinutes < 8) return 'ok';
  if (worstWaitMinutes < 20) return 'busy';
  return 'severe';
}

/** Flat (equirectangular) distance in metres — campus scale, good enough for a radius. */
function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = (b[0] - a[0]) * 111_320;
  const dLng = (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// ---------------------------------------------------------------- geometry

/** A path pre-processed with cumulative segment lengths for fast interpolation. */
interface PreparedPath {
  points: LatLng[];
  cumulative: number[];
  total: number;
}

/** Flat (equirectangular) cumulative lengths — campus-scale relative spacing only. */
function preparePath(points: LatLng[]): PreparedPath {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];
    const dLat = lat2 - lat1;
    const dLng = (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180);
    cumulative.push(cumulative[i - 1] + Math.sqrt(dLat * dLat + dLng * dLng));
  }
  return { points, cumulative, total: cumulative[cumulative.length - 1] || 1 };
}

/** Position along a prepared path at fraction `frac ∈ [0, 1]`. */
function pointAtFraction(prepared: PreparedPath, frac: number): LatLng {
  const { points, cumulative, total } = prepared;
  if (points.length === 1) return points[0];
  const target = Math.min(1, Math.max(0, frac)) * total;
  let i = 1;
  while (i < cumulative.length && cumulative[i] < target) i += 1;
  if (i >= points.length) return points[points.length - 1];
  const segStart = cumulative[i - 1];
  const segLen = cumulative[i] - segStart || 1;
  const segFrac = (target - segStart) / segLen;
  const [lat1, lng1] = points[i - 1];
  const [lat2, lng2] = points[i];
  return [lat1 + (lat2 - lat1) * segFrac, lng1 + (lng2 - lng1) * segFrac];
}

// ---------------------------------------------------------------- buses

interface BusSpec {
  key: string;
  path: PreparedPath;
  color: string;
  speed: number;
  offset: number;
  kind: 'core' | 'extra';
  label: string;
}

function busIcon(spec: BusSpec): L.DivIcon {
  const extra = spec.kind === 'extra';
  const size = extra ? 20 : 17;
  return L.divIcon({
    className: 'sim-bus-marker',
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:${extra ? '5px' : '50%'};
      background:${spec.color};color:#fff;font-size:${extra ? 11 : 10}px;line-height:1;
      box-shadow:0 1px 3px rgba(0,0,0,0.45);border:1.6px solid #fff;">${extra ? '🚍' : '🚌'}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** A pulsing star marks the demand event's location (centroid of affected stops). */
function eventIcon(): L.DivIcon {
  const size = 28;
  return L.divIcon({
    className: 'sim-event-marker',
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:50%;
      background:${EVENT_COLOR};color:#fff;font-size:15px;line-height:1;
      box-shadow:0 0 0 5px rgba(219,39,119,0.22),0 1px 5px rgba(0,0,0,0.5);
      border:2px solid #fff;">★</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Imperative bus layer — positions are updated via `setLatLng` on each `t`
 *  tick rather than re-rendering React nodes, keeping the animation cheap. */
function BusLayer({ specs, t }: { specs: BusSpec[]; t: number }) {
  const map = useMap();
  const markersRef = useRef<Record<string, L.Marker>>({});

  useEffect(() => {
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    specs.forEach((spec) => {
      const marker = L.marker(spec.path.points[0], {
        icon: busIcon(spec),
        interactive: false,
        keyboard: false,
      });
      marker.addTo(map);
      markersRef.current[spec.key] = marker;
    });
    const markers = markersRef.current;
    return () => {
      Object.values(markers).forEach((m) => m.remove());
    };
  }, [map, specs]);

  useEffect(() => {
    specs.forEach((spec) => {
      const frac = (((t * spec.speed + spec.offset) % 1) + 1) % 1;
      markersRef.current[spec.key]?.setLatLng(pointAtFraction(spec.path, frac));
    });
  }, [specs, t]);

  return null;
}

// ---------------------------------------------------------------- fit view

/** Fits the map to a bounding box whenever the positions change. */
function FitBounds({ positions, padding, maxZoom }: { positions: LatLng[]; padding: number; maxZoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    const bounds = L.latLngBounds(positions);
    map.fitBounds(bounds, { padding: [padding, padding], maxZoom });
  }, [map, positions, padding, maxZoom]);
  return null;
}

// ---------------------------------------------------------------- events

interface EventMarker {
  ev: SimEvent;
  pos: LatLng;
  radiusM: number;
  affected: LatLng[];
}

// ---------------------------------------------------------------- component

interface SimRouteMapProps {
  title: string;
  subtitle?: string;
  /** `comparison.input.coreService.stops` — real WGS84 coordinates. */
  stops: SimStop[];
  /** `comparison.input.coreService.routes`, drawn as polylines through their stop sequence. */
  routes: SimRouteDef[];
  /** `SimResults.stopWindowDelays` for the run being shown. Drives stop & corridor colour. */
  delays: SimStopWindowDelay[];
  /** Scheduled core trips per route — sets how many core buses animate on each corridor. */
  coreBusCounts: Map<RouteId, number>;
  /** Candidate extra-bus itineraries, animated as supplemental buses (candidate map only). */
  itineraries?: SimBusItinerary[];
  /** Demand events to mark on the map, with their forecast impact drawn to affected stops. */
  events?: SimEvent[];
  /** When set, the map fits to just these stops (used to zoom a card onto one corridor). */
  focusStopIds?: StopId[];
  /** Stops to ring in the supplemental-bus colour (the ones this view is about). */
  highlightStopIds?: StopId[];
  /** Shorter, chrome-light rendering for the opportunity cards. */
  compact?: boolean;
  /** Shared replay clock, `0..1`. */
  t: number;
  className?: string;
}

/**
 * One simulated run on a live UIUC campus map.
 *
 * Stops are placed at their real latitude/longitude over an OpenStreetMap base
 * layer; each corridor is the route's stop sequence drawn along the map, tinted
 * by the worst expected wait the backend reported at any of its stops. Core
 * buses animate along every corridor (as many as the scenario schedules) and,
 * on the candidate map, the planner's supplemental buses run their actual
 * itineraries. When `events` are supplied, each demand event is marked at the
 * centroid of its affected stops with a forecast-impact halo and lines drawn to
 * every stop it loads. Everything is read from the loaded {@link SimComparison};
 * nothing is invented for a value the backend left null.
 */
export default function SimRouteMap({
  title,
  subtitle,
  stops,
  routes,
  delays,
  coreBusCounts,
  itineraries = [],
  events = [],
  focusStopIds,
  highlightStopIds,
  compact = false,
  t,
  className,
}: SimRouteMapProps) {
  const summaries = useMemo(() => summarizeStopDelays(delays), [delays]);

  const stopPos = useMemo(() => {
    const map = new Map<StopId, LatLng>();
    for (const s of stops) map.set(s.id, [s.latitude, s.longitude]);
    return map;
  }, [stops]);

  const positions = useMemo(() => [...stopPos.values()], [stopPos]);

  /** Which stops this card is "about" — ringed in the supplemental-bus colour. */
  const highlightSet = useMemo(() => new Set(highlightStopIds ?? []), [highlightStopIds]);

  const maxPassengers = useMemo(() => {
    let max = 0;
    for (const s of summaries.values()) max = Math.max(max, s.supportingPassengerCount);
    return max;
  }, [summaries]);

  /** Worst wait seen along each route, for corridor colour. */
  const routeBand = useMemo(() => {
    const bands = new Map<RouteId, Band>();
    for (const route of routes) {
      let worst: number | null = null;
      for (const id of route.stopSequence) {
        const w = summaries.get(id)?.worstWaitMinutes;
        if (w != null) worst = worst == null ? w : Math.max(worst, w);
      }
      bands.set(route.id, bandFor(worst));
    }
    return bands;
  }, [routes, summaries]);

  const routeLines = useMemo(
    () =>
      routes
        .map((route) => ({
          route,
          points: route.stopSequence
            .map((id) => stopPos.get(id))
            .filter((p): p is LatLng => p != null),
          color: WAIT_COLORS[routeBand.get(route.id) ?? 'none'],
        }))
        .filter((r) => r.points.length >= 2),
    [routes, stopPos, routeBand],
  );

  /** Dashed polylines for each supplemental trip leg (candidate map only). */
  const extraLegs = useMemo(() => {
    const legs: { key: string; points: LatLng[] }[] = [];
    itineraries.forEach((bus, bi) => {
      bus.trips.forEach((trip, ti) => {
        const points = trip.stops
          .filter((s) => !s.isDeadhead)
          .map((s) => stopPos.get(s.stopId))
          .filter((p): p is LatLng => p != null);
        if (points.length >= 2) legs.push({ key: `${bus.busId}-${trip.tripId}-${bi}-${ti}`, points });
      });
    });
    return legs;
  }, [itineraries, stopPos]);

  /** Event markers: centroid of each event's affected stops, plus an impact radius. */
  const eventMarkers = useMemo<EventMarker[]>(() => {
    const out: EventMarker[] = [];
    for (const ev of events) {
      const affected = ev.affectedStopIds.map((id) => stopPos.get(id)).filter((p): p is LatLng => p != null);
      if (affected.length === 0) continue;
      const lat = affected.reduce((s, p) => s + p[0], 0) / affected.length;
      const lng = affected.reduce((s, p) => s + p[1], 0) / affected.length;
      const pos: LatLng = [lat, lng];
      const radiusM = Math.max(260, ...affected.map((p) => metersBetween(pos, p) * 1.18));
      out.push({ ev, pos, radiusM, affected });
    }
    return out;
  }, [events, stopPos]);

  /** Stops any event loads — ringed in the event colour so "where it hits" is obvious. */
  const eventAffectedSet = useMemo(() => {
    const set = new Set<StopId>();
    for (const ev of events) for (const id of ev.affectedStopIds) set.add(id);
    return set;
  }, [events]);

  const busSpecs = useMemo<BusSpec[]>(() => {
    const specs: BusSpec[] = [];
    // Core service: animate scheduled buses along each corridor.
    routeLines.forEach(({ route, points, color }) => {
      const path = preparePath(points);
      const count = Math.min(6, Math.max(1, coreBusCounts.get(route.id) ?? 1));
      for (let i = 0; i < count; i += 1) {
        specs.push({
          key: `core-${route.id}-${i}`,
          path,
          color,
          speed: 1,
          offset: i / count,
          kind: 'core',
          label: route.name,
        });
      }
    });
    // Candidate supplemental buses: animate each itinerary along its real legs.
    extraLegs.forEach((leg, i) => {
      specs.push({
        key: `extra-${leg.key}`,
        path: preparePath(leg.points),
        color: EXTRA_BUS_COLOR,
        speed: 1.15,
        offset: (i * 0.37) % 1,
        kind: 'extra',
        label: 'Supplemental bus',
      });
    });
    return specs;
  }, [routeLines, extraLegs, coreBusCounts]);

  /** The bounding box the map fits: the focus stops if given, else everything. */
  const fitPositions = useMemo<LatLng[]>(() => {
    if (focusStopIds && focusStopIds.length > 0) {
      const pts = focusStopIds.map((id) => stopPos.get(id)).filter((p): p is LatLng => p != null);
      if (pts.length > 0) return pts;
    }
    return positions;
  }, [focusStopIds, stopPos, positions]);

  const center = useMemo<LatLng>(() => {
    if (positions.length === 0) return [40.1065, -88.2285];
    const lat = positions.reduce((s, p) => s + p[0], 0) / positions.length;
    const lng = positions.reduce((s, p) => s + p[1], 0) / positions.length;
    return [lat, lng];
  }, [positions]);

  const mapHeight = compact ? 'h-44 sm:h-52' : 'h-72 lg:h-80';

  if (stops.length === 0) {
    return (
      <figure className={cn('flex min-w-0 flex-col gap-2', className)}>
        <MapCaption title={title} subtitle={subtitle} />
        <div
          className={cn(
            'flex items-center justify-center rounded-sm border border-dashed border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-secondary)] p-6 text-center',
            mapHeight,
          )}
        >
          <span className="max-w-xs text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">
            This scenario&apos;s core service contains no stops, so there is no geography to draw.
          </span>
        </div>
      </figure>
    );
  }

  return (
    <figure className={cn('flex min-w-0 flex-col gap-2', className)}>
      {(title || subtitle) && <MapCaption title={title} subtitle={subtitle} />}
      <div
        className={cn(
          'relative overflow-hidden rounded-sm border border-[var(--c3-style-basic-border-weak)]',
          mapHeight,
        )}
      >
        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom={false}
          zoomControl={!compact}
          attributionControl={!compact}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds positions={fitPositions} padding={compact ? 24 : 36} maxZoom={compact ? 15 : 16} />

          {routeLines.map(({ route, points, color }) => (
            <Polyline
              key={route.id}
              positions={points}
              pathOptions={{ color, weight: compact ? 4 : 5, opacity: 0.8, lineCap: 'round', lineJoin: 'round' }}
            >
              <Tooltip sticky>
                <span className="text-c3-bold-label-l3">{route.name}</span>
              </Tooltip>
            </Polyline>
          ))}

          {/* Forecast impact: halo around the event, lines to every stop it loads. */}
          {eventMarkers.map(({ ev, pos, radiusM, affected }) => (
            <React.Fragment key={`ev-${ev.id}`}>
              <Circle
                center={pos}
                radius={radiusM}
                pathOptions={{ color: EVENT_COLOR, weight: 1, opacity: 0.5, fillColor: EVENT_COLOR, fillOpacity: 0.08 }}
              />
              {affected.map((p, i) => (
                <Polyline
                  key={`ev-${ev.id}-impact-${i}`}
                  positions={[pos, p]}
                  pathOptions={{ color: EVENT_COLOR, weight: 1.5, opacity: 0.55, dashArray: '2 5' }}
                />
              ))}
            </React.Fragment>
          ))}

          {extraLegs.map((leg) => (
            <Polyline
              key={leg.key}
              positions={leg.points}
              pathOptions={{ color: EXTRA_BUS_COLOR, weight: 3, opacity: 0.9, dashArray: '4 6', lineCap: 'round' }}
            />
          ))}

          {stops.map((stop) => {
            const summary = summaries.get(stop.id);
            const band = bandFor(summary?.worstWaitMinutes);
            const share = maxPassengers > 0 ? (summary?.supportingPassengerCount ?? 0) / maxPassengers : 0;
            const radius = band === 'none' ? 4 : 5 + Math.sqrt(share) * 8;
            const hasData = band !== 'none';
            const pos = stopPos.get(stop.id);
            const ring = highlightSet.has(stop.id)
              ? EXTRA_BUS_COLOR
              : eventAffectedSet.has(stop.id)
                ? EVENT_COLOR
                : null;
            return (
              <React.Fragment key={stop.id}>
                {ring && pos && (
                  <CircleMarker
                    center={pos}
                    radius={radius + 4}
                    pathOptions={{ color: ring, weight: 2, opacity: 0.9, fillOpacity: 0, dashArray: '3 3' }}
                    interactive={false}
                  />
                )}
                <CircleMarker
                  center={[stop.latitude, stop.longitude]}
                  radius={radius}
                  pathOptions={{
                    color: '#ffffff',
                    weight: 1.5,
                    fillColor: WAIT_COLORS[band],
                    fillOpacity: hasData ? 0.9 : 0.35,
                  }}
                >
                  <Tooltip>
                    <StopTooltip stop={stop} summary={summary} />
                  </Tooltip>
                </CircleMarker>
              </React.Fragment>
            );
          })}

          {eventMarkers.map(({ ev, pos }) => (
            <Marker key={`ev-marker-${ev.id}`} position={pos} icon={eventIcon()} interactive>
              <Tooltip>
                <EventTooltip ev={ev} />
              </Tooltip>
            </Marker>
          ))}

          <BusLayer specs={busSpecs} t={t} />
        </MapContainer>
      </div>
      {!compact && <MapLegend hasExtra={extraLegs.length > 0} hasEvent={eventMarkers.length > 0} />}
    </figure>
  );
}

function MapCaption({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <figcaption className="flex items-baseline justify-between gap-2">
      <span className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{title}</span>
      {subtitle && <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{subtitle}</span>}
    </figcaption>
  );
}

function StopTooltip({ stop, summary }: { stop: SimStop; summary: StopDelaySummary | undefined }) {
  const hasData = summary != null && summary.observedWindows > 0 && summary.worstWaitMinutes != null;
  return (
    <span className="text-c3-regular-label-l3">
      <span className="text-c3-bold-label-l3">
        {stop.name}
        {stop.stopCode ? ` (${stop.stopCode})` : ''}
      </span>
      <br />
      {hasData
        ? `Worst expected wait ${fmtMin(summary.worstWaitMinutes)} · ${fmtNum(summary.supportingPassengerCount)} passengers`
        : `Expected wait ${NO_DATA} — no simulated passengers waited here`}
    </span>
  );
}

function EventTooltip({ ev }: { ev: SimEvent }) {
  const d = ev.demandEffect;
  const legs = [d?.generatesInbound ? 'inbound' : null, d?.generatesOutbound ? 'outbound' : null]
    .filter(Boolean)
    .join(' + ');
  return (
    <span className="text-c3-regular-label-l3">
      <span className="text-c3-bold-label-l3" style={{ color: EVENT_COLOR }}>
        ★ {ev.name}
      </span>
      <br />
      {ev.eventType}
      {d?.attendance != null ? ` · ${fmtNum(d.attendance)} attending` : ''}
      {d?.busUseShare != null ? ` · ~${fmtPct(d.busUseShare)} ride the bus` : ''}
      {legs ? <br /> : null}
      {legs ? `Drives ${legs} demand onto ${ev.affectedStopIds.length} stop(s)` : null}
    </span>
  );
}

function MapLegend({ hasExtra, hasEvent }: { hasExtra: boolean; hasEvent: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
      <LegendDot color={WAIT_COLORS.ok} label="Worst wait < 8 min" />
      <LegendDot color={WAIT_COLORS.busy} label="8–20 min" />
      <LegendDot color={WAIT_COLORS.severe} label="20+ min" />
      <LegendDot color={WAIT_COLORS.none} label="No observations" filled={false} />
      {hasEvent && (
        <span className="flex items-center gap-1.5">
          <span style={{ color: EVENT_COLOR }}>★</span>
          Event &amp; forecast impact
        </span>
      )}
      {hasExtra && (
        <span className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="1" y1="4" x2="21" y2="4" stroke={EXTRA_BUS_COLOR} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Supplemental bus legs
        </span>
      )}
      <span className="ml-auto italic">Positioned from stop latitude/longitude · marker area scales with waiting passengers</span>
    </div>
  );
}

function LegendDot({ color, label, filled = true }: { color: string; label: string; filled?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="12" height="12" aria-hidden>
        <circle cx="6" cy="6" r="4.5" fill={filled ? color : 'none'} stroke={color} strokeWidth="1.5" />
      </svg>
      {label}
    </span>
  );
}
