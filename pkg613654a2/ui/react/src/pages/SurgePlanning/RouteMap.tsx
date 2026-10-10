/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { LOAD_COLORS, loadLevel, type LatLng, type RouteDef, type RoutePlan } from './surgeData';
import { pointAtFraction, preparePath, type PreparedPath } from './geo';

/**
 * Imperative bus layer. Buses are animated by updating `marker.setLatLng` on
 * every `t` change rather than re-rendering React nodes — this keeps the
 * animation smooth and cheap even with a full fleet on screen.
 */
function BusLayer({ routes, t }: { routes: RouteDef[]; t: number }) {
  const map = useMap();
  const markersRef = useRef<Record<string, L.Marker>>({});

  // Pre-compute each route's path geometry; only re-run when the routes change.
  const prepared = useMemo<{ route: RouteDef; path: PreparedPath }[]>(
    () => routes.map((route) => ({ route, path: preparePath(route.path) })),
    [routes],
  );

  // Create one marker per bus when the fleet changes; tear them down on cleanup.
  useEffect(() => {
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    routes.forEach((route) => {
      route.buses.forEach((bus) => {
        const color = LOAD_COLORS[loadLevel(bus.load)];
        const icon = L.divIcon({
          className: 'surge-bus-marker',
          html: `<span style="
            display:flex;align-items:center;justify-content:center;
            width:18px;height:18px;border-radius:6px;
            background:${color};color:#fff;font-size:10px;line-height:1;
            box-shadow:0 1px 3px rgba(0,0,0,0.4);border:1.5px solid #fff;">&#128652;</span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const marker = L.marker([0, 0], { icon, interactive: false, keyboard: false });
        marker.addTo(map);
        markersRef.current[`${route.id}/${bus.id}`] = marker;
      });
    });

    const markers = markersRef.current;
    return () => {
      Object.values(markers).forEach((m) => m.remove());
    };
  }, [map, routes]);

  // Move every bus to its interpolated position for the current clock value.
  useEffect(() => {
    prepared.forEach(({ route, path }) => {
      route.buses.forEach((bus) => {
        const frac = ((t * bus.speed + bus.offset) % 1 + 1) % 1;
        const pos = pointAtFraction(path, frac);
        markersRef.current[`${route.id}/${bus.id}`]?.setLatLng(pos);
      });
    });
  }, [prepared, t]);

  return null;
}

interface RouteMapProps {
  plan: RoutePlan;
  t: number;
  center: LatLng;
  zoom: number;
}

/**
 * A single route map: an OpenStreetMap base layer centered on UIUC, route
 * polylines colored by corridor load, and live-animated buses driven by `t`.
 */
export default function RouteMap({ plan, t, center, zoom }: RouteMapProps) {
  return (
    <div className="h-full w-full overflow-hidden rounded-[var(--c3-style-border-radius-6)]">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {plan.routes.map((route) => {
          const color = LOAD_COLORS[loadLevel(route.loadFactor)];
          return (
            <Polyline
              key={route.id}
              positions={route.path}
              pathOptions={{
                color,
                weight: 4 + route.loadFactor * 6,
                opacity: 0.85,
                dashArray: route.isNew ? '2 8' : undefined,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            >
              <Tooltip sticky>
                <span className="text-c3-bold-label-l3">{route.name}</span>
                <br />
                {`Peak load ${Math.round(route.loadFactor * 100)}% · ${route.buses.length} buses`}
              </Tooltip>
            </Polyline>
          );
        })}
        <BusLayer routes={plan.routes} t={t} />
      </MapContainer>
    </div>
  );
}
