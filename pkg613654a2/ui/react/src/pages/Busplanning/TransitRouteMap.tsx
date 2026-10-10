/*
 * TransitRouteMap — animated Leaflet map of the proposed supplemental route network.
 *
 * Draws each proposed route as a polyline through its real stop coordinates (every
 * NetworkOrderedStop carries latitude/longitude) over an OpenStreetMap street basemap, and
 * animates one or more buses gliding along each route — the same technique as the SurgePlanner
 * map (imperative marker.setLatLng on a requestAnimationFrame clock, no React re-render per tick).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Polyline, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeneratedNetwork, NetworkRoute } from '@/Interfaces';

const numberFmt = new Intl.NumberFormat('en-US');

type LatLng = [number, number];

interface PreparedPath {
  points: LatLng[];
  cumulative: number[];
  total: number;
}

function preparePath(points: LatLng[]): PreparedPath {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];
    const dLat = lat2 - lat1;
    const dLng = (lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180);
    cumulative.push(cumulative[i - 1] + Math.sqrt(dLat * dLat + dLng * dLng));
  }
  const total = cumulative[cumulative.length - 1] || 1;
  return { points, cumulative, total };
}

function pointAtFraction(prepared: PreparedPath, frac: number): LatLng {
  const { points, cumulative, total } = prepared;
  if (points.length <= 1) return points[0] ?? [0, 0];
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

/** Expand stop coordinates into an L-shaped (Manhattan / grid) path: travel along lng, then lat. */
function manhattanize(stops: LatLng[]): LatLng[] {
  if (stops.length < 2) return stops;
  const out: LatLng[] = [stops[0]];
  for (let i = 1; i < stops.length; i += 1) {
    const [lat1] = stops[i - 1];
    const [lat2, lng2] = stops[i];
    out.push([lat1, lng2]); // elbow: move east/west first, then north/south
    out.push([lat2, lng2]);
  }
  return out;
}

/** Approximate km between two lat/lng points (equirectangular, campus-scale). */
function kmBetween([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const dLat = (lat2 - lat1) * 111;
  const dLng = (lng2 - lng1) * 111 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function pathKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += kmBetween(points[i - 1], points[i]);
  return total;
}

interface BusSpec {
  key: string;
  path: PreparedPath;
  color: string;
  speed: number;
  offset: number;
}

function busIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html:
      `<div style="font-size:18px;line-height:18px;filter:drop-shadow(0 0 1px ${color})">🚌</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function FitBounds({ positions }: { positions: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    map.fitBounds(L.latLngBounds(positions), { padding: [30, 30] });
  }, [map, positions]);
  return null;
}

function BusLayer({ specs, t }: { specs: BusSpec[]; t: number }) {
  const map = useMap();
  const markersRef = useRef<Record<string, L.Marker>>({});

  useEffect(() => {
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    specs.forEach((spec) => {
      const marker = L.marker(spec.path.points[0], {
        icon: busIcon(spec.color),
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

function useReplayClock(loopSeconds = 24): number {
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  useEffect(() => {
    const step = (ts: number) => {
      if (lastRef.current == null) lastRef.current = ts;
      const dt = (ts - lastRef.current) / 1000;
      lastRef.current = ts;
      setT((prev) => {
        const next = prev + dt / loopSeconds;
        return next >= 1 ? next - 1 : next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [loopSeconds]);
  return t;
}

function routePositions(route: NetworkRoute): LatLng[] {
  return route.orderedStops
    .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
    .map((s) => [s.latitude, s.longitude] as LatLng);
}

interface TransitRouteMapProps {
  network: GeneratedNetwork;
}

export default function TransitRouteMap({ network }: TransitRouteMapProps) {
  const t = useReplayClock();

  const drawn = useMemo(
    () =>
      network.routes
        .map((route, idx) => {
          const stops = routePositions(route);
          void idx;
          return { route, stops, positions: manhattanize(stops), color: '#059669' };
        })
        .filter((d) => d.stops.length >= 2),
    [network],
  );

  const allPositions = useMemo(() => drawn.flatMap((d) => d.positions), [drawn]);

  const metrics = useMemo(() => {
    const totalKm = drawn.reduce((s, d) => s + pathKm(d.positions), 0);
    const totalStops = drawn.reduce((s, d) => s + d.stops.length, 0);
    const buses = drawn.reduce((s, d) => s + Math.max(1, Math.min(4, d.route.vehicleCount || 1)), 0);
    const avgKm = drawn.length ? totalKm / drawn.length : 0;
    // Mean time to service: expected wait (half the headway) + in-vehicle one-way ride, demand-weighted.
    let wSum = 0;
    let dSum = 0;
    drawn.forEach((d) => {
      const w = d.route.assignedRiders || 0;
      const mtts = (d.route.headwayMin || 0) / 2 + (d.route.oneWayMin || 0);
      wSum += mtts * w;
      dSum += w;
    });
    const meanTimeToService = dSum ? wSum / dSum : 0;
    const assigned = network.plan.coverage.assignedRiders;
    const demand = network.plan.coverage.estimatedDemand;
    const servicePct = network.plan.coverage.passengerServicePct;
    return { routes: drawn.length, totalStops, buses, totalKm, avgKm, meanTimeToService, assigned, demand, servicePct };
  }, [drawn, network]);

  const specs = useMemo<BusSpec[]>(() => {
    const out: BusSpec[] = [];
    drawn.forEach((d) => {
      const path = preparePath(d.positions);
      const count = Math.max(1, Math.min(4, d.route.vehicleCount || 1));
      for (let i = 0; i < count; i += 1) {
        out.push({ key: `${d.route.routeId}:${i}`, path, color: d.color, speed: 1, offset: i / count });
      }
    });
    return out;
  }, [drawn]);

  if (drawn.length === 0) {
    return (
      <div className="rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] p-4 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
        No proposed routes with coordinates to map yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Mean time to service — old', value: `${(metrics.meanTimeToService + network.plan.fleet.meanTimeToServiceMin).toFixed(1)} min` },
          { label: 'Mean time to service — new', value: `${metrics.meanTimeToService.toFixed(1)} min` },
          { label: 'Riders served — old', value: `0 / ${numberFmt.format(metrics.demand)}` },
          { label: 'Riders served — new', value: `${numberFmt.format(metrics.assigned)} / ${numberFmt.format(metrics.demand)}` },
          { label: 'Service coverage', value: `${metrics.servicePct}%` },
          { label: 'Routes', value: String(metrics.routes) },
          { label: 'Buses', value: String(metrics.buses) },
          { label: 'Stops', value: String(metrics.totalStops) },
          { label: 'Total length', value: `${metrics.totalKm.toFixed(1)} km` },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-md border border-[var(--c3-style-basic-border-weak)] bg-[var(--c3-style-basic-bg-card)] px-3 py-2"
          >
            <div className="text-c3-bold-label-l2">{m.value}</div>
            <div className="text-c3-regular-label-l4 text-[var(--c3-style-basic-fg-secondary)]">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="h-[420px] w-full overflow-hidden rounded-md border border-[var(--c3-style-basic-border-weak)]">
        <MapContainer
          center={[40.1065, -88.2285]}
          zoom={14}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds positions={allPositions} />
          {drawn.map((d) => (
            <Polyline key={d.route.routeId} positions={d.positions} pathOptions={{ color: d.color, weight: 4, opacity: 0.85 }} />
          ))}
          {drawn.flatMap((d) =>
            d.stops.map((pos, i) => (
              <CircleMarker
                key={`${d.route.routeId}:stop:${i}`}
                center={pos}
                radius={4}
                pathOptions={{ color: d.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }}
              >
                <Tooltip>{d.route.orderedStops[i]?.name ?? 'Stop'}</Tooltip>
              </CircleMarker>
            )),
          )}
          <BusLayer specs={specs} t={t} />
        </MapContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-c3-regular-label-l3">
        {drawn.map((d) => (
          <span key={d.route.routeId} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            {d.route.routeName}
          </span>
        ))}
      </div>
    </div>
  );
}
